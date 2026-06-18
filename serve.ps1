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
        $key = if ($AnthropicKey) { $AnthropicKey } else { $request.Headers['x-api-key-fwd'] }
        try {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            $http = New-Object System.Net.Http.HttpClient
            $http.Timeout = [System.TimeSpan]::FromSeconds(60)
            $content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, 'application/json')
            $http.DefaultRequestHeaders.Add('x-api-key', $key)
            $http.DefaultRequestHeaders.Add('anthropic-version', '2023-06-01')

            $apiRes = $http.PostAsync('https://api.anthropic.com/v1/messages', $content).Result
            $resBody = $apiRes.Content.ReadAsStringAsync().Result
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($resBody)
            $response.ContentType = 'application/json'
            $response.StatusCode = [int]$apiRes.StatusCode
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
    if ($localPath -eq '/') { $localPath = '/index.html' }
    $filePath = Join-Path $Root ($localPath.TrimStart('/'))

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
