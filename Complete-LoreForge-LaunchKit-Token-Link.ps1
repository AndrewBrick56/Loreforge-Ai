$ErrorActionPreference = 'Stop'
$projectRoot = (Get-Location).Path

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'package.json'))) {
    Write-Host 'ERROR: Open PowerShell in the LoreForge project root (the folder with package.json).' -ForegroundColor Red
    return
}

$routeRelative = 'src\app\api\characters\[id]\token\route.ts'
$panelRelative = 'src\components\characters\token-panel.tsx'
$routePath = Join-Path $projectRoot $routeRelative
$panelPath = Join-Path $projectRoot $panelRelative

foreach ($path in @($routePath, $panelPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Write-Host "ERROR: Required file missing: $path. No files were changed." -ForegroundColor Red
        return
    }
}

$routeOriginal = [System.IO.File]::ReadAllText($routePath)
$panelOriginal = [System.IO.File]::ReadAllText($panelPath)
$route = $routeOriginal.Replace("`r`n", "`n")
$panel = $panelOriginal.Replace("`r`n", "`n")

function Replace-ExactlyOnce {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$OldText,
        [Parameter(Mandatory = $true)][string]$NewText,
        [Parameter(Mandatory = $true)][string]$Description
    )
    $count = 0
    $from = 0
    while ($true) {
        $index = $Content.IndexOf($OldText, $from, [System.StringComparison]::Ordinal)
        if ($index -lt 0) { break }
        $count++
        $from = $index + $OldText.Length
    }
    if ($count -ne 1) {
        throw "Safety check stopped for '$Description': expected one exact match, found $count. No files have been saved."
    }
    return $Content.Replace($OldText, $NewText)
}

# Make sure the existing API already supports launchpad IDs and uses the admin client.
if ($route -notmatch 'launchpad_id:\s*body\.launchpadId\s*\?\?\s*null') {
    throw 'The token API does not match the expected launchpad-aware version. No files have been saved.'
}
if ($route -notmatch 'createAdminClient\(' -or $route -notmatch 'launch_projects') {
    # launch_projects should not exist in the route yet; this guards only the service-role helper import.
    if ($route -notmatch 'createAdminClient') {
        throw 'The token API does not use the expected server admin client. No files have been saved.'
    }
}

$oldPostReturn = @'
  return NextResponse.json({
    ok: true,
    verifiedOnChain: verified,
    warning: onChain.status === "unverifiable" ? onChain.reason : undefined,
  });
'@
$newPostReturn = @'
  // Link the token mint to the latest Launch Kit project for this same character.
  // Do not change project status: a mint association alone does not prove launch or ownership.
  let launchProjectLinked = false;
  let launchProjectSyncWarning: string | undefined;
  const { data: launchProject, error: launchProjectLookupError } = await admin
    .from("launch_projects")
    .select("id")
    .eq("character_id", id)
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (launchProjectLookupError) {
    console.error("[LoreForge] Launch Kit token link lookup failed:", launchProjectLookupError.message);
    launchProjectSyncWarning = "The token was saved, but the Launch Kit project could not be linked.";
  } else if (launchProject) {
    const { error: launchProjectUpdateError } = await admin
      .from("launch_projects")
      .update({ token_mint_address: body.mintAddress, updated_at: new Date().toISOString() })
      .eq("id", launchProject.id)
      .eq("owner_id", user.id);

    if (launchProjectUpdateError) {
      console.error("[LoreForge] Launch Kit token link update failed:", launchProjectUpdateError.message);
      launchProjectSyncWarning = "The token was saved, but the Launch Kit project could not be linked.";
    } else {
      launchProjectLinked = true;
    }
  }

  return NextResponse.json({
    ok: true,
    verifiedOnChain: verified,
    launchProjectLinked,
    launchProjectSyncWarning,
    warning: onChain.status === "unverifiable" ? onChain.reason : undefined,
  });
'@
$route = Replace-ExactlyOnce -Content $route -OldText $oldPostReturn -NewText $newPostReturn -Description 'sync saved token to Launch Kit project'

# Keep the associated token and saved Launch Kit record in sync when an owner removes the association.
$oldDelete = @'
  const { error } = await supabase.from("character_tokens").delete().eq("character_id", id);
  if (error) return NextResponse.json({ error: "Couldn't remove the token association.", code: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
'@
$newDelete = @'
  const { data: currentToken } = await supabase
    .from("character_tokens")
    .select("mint_address")
    .eq("character_id", id)
    .maybeSingle();

  const { error } = await supabase.from("character_tokens").delete().eq("character_id", id);
  if (error) return NextResponse.json({ error: "Couldn't remove the token association.", code: "DB_ERROR" }, { status: 500 });

  if (currentToken?.mint_address && hasServiceRole()) {
    const admin = createAdminClient();
    const { error: unlinkError } = await admin
      .from("launch_projects")
      .update({ token_mint_address: null, updated_at: new Date().toISOString() })
      .eq("character_id", id)
      .eq("owner_id", user.id)
      .eq("token_mint_address", currentToken.mint_address);
    if (unlinkError) {
      // The token association was successfully removed; log, but don't turn it into a failed delete.
      console.error("[LoreForge] Launch Kit token unlink failed:", unlinkError.message);
    }
  }

  return NextResponse.json({ ok: true });
'@
$route = Replace-ExactlyOnce -Content $route -OldText $oldDelete -NewText $newDelete -Description 'clear Launch Kit link when association is removed'

# Surface sync result in the existing TokenPanel after a successful association.
$oldPanelState = '  const [warning, setWarning] = useState<string | null>(null);'
$newPanelState = @'
  const [warning, setWarning] = useState<string | null>(null);
  const [launchKitNotice, setLaunchKitNotice] = useState<string | null>(null);
'@
$panel = Replace-ExactlyOnce -Content $panel -OldText $oldPanelState -NewText $newPanelState -Description 'add Launch Kit sync notice state'

$oldAssociateStart = @'
    setError(null);
    setWarning(null);
    try {
'@
$newAssociateStart = @'
    setError(null);
    setWarning(null);
    setLaunchKitNotice(null);
    try {
'@
$panel = Replace-ExactlyOnce -Content $panel -OldText $oldAssociateStart -NewText $newAssociateStart -Description 'reset Launch Kit sync notice for each save'

$oldWarningHandle = '      if (data.warning) setWarning(data.warning);'
$newWarningHandle = @'
      if (data.warning) setWarning(data.warning);
      if (data.launchProjectLinked) {
        setLaunchKitNotice("Token saved and linked to your latest Launch Kit project.");
      } else if (data.launchProjectSyncWarning) {
        setLaunchKitNotice(data.launchProjectSyncWarning);
      }
'@
$panel = Replace-ExactlyOnce -Content $panel -OldText $oldWarningHandle -NewText $newWarningHandle -Description 'show Launch Kit sync result'

$oldNoticeAnchor = '          {warning && <p className="text-xs text-amber-300">{warning}</p>}'
$newNoticeAnchor = @'
          {warning && <p className="text-xs text-amber-300">{warning}</p>}
          {launchKitNotice && (
            <p role="status" className="text-xs text-lf-cyan">{launchKitNotice}</p>
          )}
'@
$panel = Replace-ExactlyOnce -Content $panel -OldText $oldNoticeAnchor -NewText $newNoticeAnchor -Description 'render Launch Kit sync notice'

# Ensure this script will not silently replace content that was already integrated.
if ($route -eq $routeOriginal.Replace("`r`n", "`n") -or $panel -eq $panelOriginal.Replace("`r`n", "`n")) {
    throw 'One or more expected updates did not change source content. No files have been saved.'
}

$backupRoot = Join-Path $projectRoot ('.loreforge-code-backups\launch-kit-token-link-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupRoot 'src\app\api\characters\[id]\token') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupRoot 'src\components\characters') -Force | Out-Null
Copy-Item -LiteralPath $routePath -Destination (Join-Path $backupRoot $routeRelative)
Copy-Item -LiteralPath $panelPath -Destination (Join-Path $backupRoot $panelRelative)

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($routePath, $route, $utf8NoBom)
[System.IO.File]::WriteAllText($panelPath, $panel, $utf8NoBom)

Write-Host "`nLaunch Kit token linking added." -ForegroundColor Green
Write-Host "Updated: $routeRelative"
Write-Host "Updated: $panelRelative"
Write-Host "Backups: $backupRoot"
Write-Host "`nBehavior: associating an existing mint updates the latest saved Launch Kit project for that owned character; removing the association clears matching project mint links. The API does not mark the project as launched or claim token ownership."
Write-Host "`nNext run separately: npm run lint ; npx tsc --noEmit ; npm run build"
