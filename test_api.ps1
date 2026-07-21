$env:DATA_DIR = "G:\Holytime\ModerUtillsWebsite\data"
$env:PORT = "3100"
$env:SESSION_SECRET = "test-secret-123"

$log = @()

# Kill any existing node
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Start server
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "node"
$psi.Arguments = "server.js"
$psi.WorkingDirectory = "G:\Holytime\ModerUtillsWebsite"
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$p = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 2

function Test-Api {
    param($url, $method = "GET", $body = $null)
    $params = @{Uri = $url; Method = $method; ContentType = "application/json"}
    if ($body) { $params.Body = $body }
    try {
        $r = Invoke-WebRequest @params -UseBasicParsing
        return $r.Content
    } catch {
        return "ERROR: " + $_.Exception.Message
    }
}

# Check server running
$r = Test-Api "http://localhost:3100/"
$log += "Home page: $r"

$r = Test-Api "http://localhost:3100/api/user-role?username=unluck"
$log += "User-role: $r"

# Register a test user
$body = '{"username":"test999","password":"test123"}'
$r = Test-Api "http://localhost:3100/api/register" -method POST -body $body
$log += "Register test999: $r"

# Check user role after registration
$r = Test-Api "http://localhost:3100/api/user-role?username=test999"
$log += "User-role test999: $r"

# Login as admin
$body = '{"username":"unluck","password":"Logan20241"}'
$r = Test-Api "http://localhost:3100/api/login" -method POST -body $body
$log += "Admin login: $r"

# Login as test user
$body = '{"username":"test999","password":"test123"}'
$r = Test-Api "http://localhost:3100/api/login" -method POST -body $body
$log += "User login: $r"

# Test verify-key (should fail - no key yet)
$r = Test-Api "http://localhost:3100/api/verify-key?key=abc&hwid=testhwid&username=test999"
$log += "Verify-key (no key): $r"

# Stop server
$p.Kill()
$p.Dispose()

# Output results
$log -join "`n"
