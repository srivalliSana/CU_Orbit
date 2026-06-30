# Increment versions for Android and Server
$gradlePath = "app/build.gradle.kts"
$packagePath = "server/package.json"

Write-Host "Incrementing versions..."

# 1. Update Android Gradle
if (Test-Path $gradlePath) {
    $content = Get-Content $gradlePath
    $newContent = @()
    foreach ($line in $content) {
        if ($line -match 'versionCode = (\d+)') {
            $oldCode = [int]$matches[1]
            $newCode = $oldCode + 1
            $line = $line -replace "versionCode = $oldCode", "versionCode = $newCode"
            Write-Host "Android versionCode: $oldCode -> $newCode"
        }
        elseif ($line -match 'versionName = "(\d+)\.(\d+)(?:\.(\d+))?"') {
            $major = $matches[1]
            $minor = $matches[2]
            if ($matches[3]) {
                $patch = [int]$matches[3] + 1
                $oldVersionName = "$major.$minor.$($matches[3])"
            } else {
                $patch = 1
                $oldVersionName = "$major.$minor"
            }
            $newVersionName = "$major.$minor.$patch"
            $line = $line -replace "versionName = `"$oldVersionName`"", "versionName = `"$newVersionName`""
            Write-Host "Android versionName: $oldVersionName -> $newVersionName"
        }
        $newContent += $line
    }
    $newContent | Set-Content $gradlePath
}

# 2. Update Server package.json
if (Test-Path $packagePath) {
    $content = Get-Content $packagePath
    $newContent = @()
    foreach ($line in $content) {
        if ($line -match '"version": "(\d+)\.(\d+)\.(\d+)"') {
            $major = $matches[1]
            $minor = $matches[2]
            $patch = [int]$matches[3] + 1
            $oldVersion = "$major.$minor.$($matches[3])"
            $newVersion = "$major.$minor.$patch"
            $line = $line -replace "`"version`": `"$oldVersion`"", "`"version`": `"$newVersion`""
            Write-Host "Server version: $oldVersion -> $newVersion"
        }
        $newContent += $line
    }
    $newContent | Set-Content $packagePath
}

# Add changes to git if we are in a commit process (this will be handled by pre-commit hook)
# But here we just want the files updated.
