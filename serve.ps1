param(
    [int]$Port = 8000,
    [string]$Root = $PSScriptRoot,
    [string]$AnthropicKey = ''
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/"

$mimeMap = @{
    ".html" = "text/html"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $localPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath)

    # ── Claude API proxy ──────────────────────────────────────────────────────
    if ($request.HttpMethod -eq 'POST' -and $localPath -eq '/api/claude') {
        # Bring-your-own-key first: a key supplied by the browser (in-app Settings)
        # takes precedence over the server-side key, matching server.js
        $key = if ($request.Headers['x-api-key-fwd']) { $request.Headers['x-api-key-fwd'] } else { $AnthropicKey }
        try {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $statusCode = 200
            $resBody = ''

            $webReq = [System.Net.HttpWebRequest]::Create('https://api.anthropic.com/v1/messages')
            $webReq.Method = 'POST'
            $webReq.ContentType = 'application/json'
            $webReq.Timeout = 120000
            $webReq.ReadWriteTimeout = 120000
            $webReq.Headers.Add('x-api-key', $key)
            $webReq.Headers.Add('anthropic-version', '2023-06-01')
            $webReq.ContentLength = $bodyBytes.Length
            $reqStream = $webReq.GetRequestStream()
            $reqStream.Write($bodyBytes, 0, $bodyBytes.Length)
            $reqStream.Close()

            try {
                $webResp = $webReq.GetResponse()
                $sr = New-Object System.IO.StreamReader($webResp.GetResponseStream(), [System.Text.Encoding]::UTF8)
                $resBody = $sr.ReadToEnd(); $sr.Close()
                $statusCode = [int]$webResp.StatusCode
            } catch [System.Net.WebException] {
                $errResp = $_.Exception.Response
                if ($errResp) {
                    $sr = New-Object System.IO.StreamReader($errResp.GetResponseStream(), [System.Text.Encoding]::UTF8)
                    $resBody = $sr.ReadToEnd(); $sr.Close()
                    $statusCode = [int]([System.Net.HttpWebResponse]$errResp).StatusCode
                } else {
                    $resBody = '{"error":{"message":"' + $_.Exception.Message.Replace('"','\"') + '"}}'
                    $statusCode = 502
                }
            }

            $bytes = [System.Text.Encoding]::UTF8.GetBytes($resBody)
            $response.ContentType = 'application/json'
            $response.StatusCode = $statusCode
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":{"message":"Proxy error: ' + $_.Exception.Message + '"}}')
            $response.StatusCode = 500
            $response.ContentType = 'application/json'
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
        continue
    }

    # ── Static files ─────────────────────────────────────────────────────────
    if ($localPath -eq '/') { $localPath = '/landing/index.html' }
    $filePath = Join-Path $Root ($localPath.TrimStart('/'))

    # Directory request → serve its index.html (e.g. /app/ → /app/index.html)
    if (Test-Path $filePath -PathType Container) {
        $filePath = Join-Path $filePath 'index.html'
    }

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = $mimeMap[$ext]
        if (-not $contentType) { $contentType = 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentType = $contentType
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $response.StatusCode = 404
        $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
        $response.ContentLength64 = $errBytes.Length
        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
    }
    $response.OutputStream.Close()
}
