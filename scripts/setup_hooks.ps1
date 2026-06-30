# Configure git to use the custom hooks directory
Write-Host "Configuring Git hooks..."
git config core.hooksPath scripts/hooks
Write-Host "Git hooks configured successfully! Version will now increment automatically on each commit."
