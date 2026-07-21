$env:DATA_DIR = "G:\Holytime\ModerUtillsWebsite\data"
$env:PORT = "3200"

$proc = Start-Process -NoNewWindow -PassThru -FilePath "node" -ArgumentList "server.js"
Start-Sleep -Seconds 2

function Test-Api {
    param($url, $method = "GET", $bodyFile = $null)
    try {
        $params = @{Uri = $url; Method = $method; ContentType = "application/json"; UseBasicParsing = $true}
        if ($bodyFile) { $params.InFile = $bodyFile }
        $r = Invoke-WebRequest @params
        return $r.Content
    } catch {
        return "ERROR: " + $_.Exception.Message
    }
}

# Setup temp files
$regFile = "$env:TEMP\role_reg.json"
$loginFile = "$env:TEMP\role_login.json"
$roleFile = "$env:TEMP\role_update.json"

Set-Content -Path $regFile -Value '{"username":"roleuser","password":"test123"}' -Encoding ASCII
Set-Content -Path $loginFile -Value '{"username":"unluck","password":"Logan20241"}' -Encoding ASCII
Set-Content -Path $roleFile -Value '{"targetUsername":"roleuser","newRole":"user"}' -Encoding ASCII

Write-Output "===== REGISTER ====="
Write-Output (Test-Api "http://localhost:3200/api/register" -method POST -bodyFile $regFile)

Write-Output "===== USER-ROLE (fresh) ====="
Write-Output (Test-Api "http://localhost:3200/api/user-role?username=roleuser")

# Login as admin - need to handle cookies
Write-Output "===== ADMIN LOGIN ====="
try {
    $loginResp = Invoke-WebRequest -Uri "http://localhost:3200/api/login" -Method POST -ContentType "application/json" -InFile $loginFile -SessionVariable session -UseBasicParsing
    Write-Output $loginResp.Content
} catch {
    Write-Output "LOGIN ERROR: $($_.Exception.Message)"
}

Write-Output "===== UPDATE ROLE ====="
try {
    $roleResp = Invoke-WebRequest -Uri "http://localhost:3200/api/admin/set-role" -Method POST -ContentType "application/json" -InFile $roleFile -WebSession $session -UseBasicParsing
    Write-Output $roleResp.Content
} catch {
    Write-Output "ROLE ERROR: $($_.Exception.Message)"
}

Write-Output "===== USER-ROLE (after) ====="
Write-Output (Test-Api "http://localhost:3200/api/user-role?username=roleuser")

$proc.Kill()
