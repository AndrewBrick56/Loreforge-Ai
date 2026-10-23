$ErrorActionPreference = "Stop"

# Run from the LoreForge project root (the folder containing package.json).
$project = (Get-Location).Path
$packageJson = Join-Path $project "package.json"
$panelRelative = "src\components\characters\token-panel.tsx"
$routeRelative = "src\app\api\characters\[id]\token\preview\route.ts"
$panelPath = Join-Path $project $panelRelative
$routePath = Join-Path $project $routeRelative

if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
    Write-Host "ERROR: Open PowerShell in the LoreForge project root first." -ForegroundColor Red
    return
}
if (-not (Test-Path -LiteralPath $panelPath -PathType Leaf)) {
    Write-Host "ERROR: TokenPanel was not found at $panelRelative. No changes made." -ForegroundColor Red
    return
}
if (-not (Test-Path -LiteralPath (Join-Path $project "src\lib\tokens\market-data.ts") -PathType Leaf)) {
    Write-Host "ERROR: Detailed token market-data utility is missing. No changes made." -ForegroundColor Red
    return
}
if (Test-Path -LiteralPath $routePath) {
    Write-Host "ERROR: The preview API route already exists. No files were changed; inspect it first." -ForegroundColor Yellow
    return
}

function Replace-ExactOnce {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$OldText,
        [Parameter(Mandatory = $true)][string]$NewText,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $count = 0
    $searchFrom = 0
    while ($true) {
        $index = $Content.IndexOf($OldText, $searchFrom, [System.StringComparison]::Ordinal)
        if ($index -lt 0) { break }
        $count++
        $searchFrom = $index + $OldText.Length
    }
    if ($count -ne 1) {
        throw "Safety check stopped: expected exactly one match for '$Description', found $count. No files have been saved."
    }
    return $Content.Replace($OldText, $NewText)
}

# Prepare all changes in memory first so a mismatch cannot leave a half-edited source file.
$panelOriginal = [System.IO.File]::ReadAllText($panelPath)
$panel = $panelOriginal.Replace("`r`n", "`n")

$old = 'function fmtUsd(n: number | null): string {'
$new = @'
interface PreviewMarketData {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  priceChange24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  dexId: string;
  pairUrl: string;
  chartEmbedUrl: string;
}

function fmtUsd(n: number | null): string {
'@
$panel = Replace-ExactOnce -Content $panel -OldText $old -NewText $new -Description 'insert market preview type'

$old = '  const [launchpadInput, setLaunchpadInput] = useState<"" | "pump-fun" | "raydium-launchlab">("");'
$new = @'
  const [launchpadInput, setLaunchpadInput] = useState<"" | "pump-fun" | "raydium-launchlab">("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMarket, setPreviewMarket] = useState<PreviewMarketData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
'@
$panel = Replace-ExactOnce -Content $panel -OldText $old -NewText $new -Description 'add market preview state'

$old = '  async function associate() {'
$new = @'
  async function previewMarketData() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewMarket(null);
    try {
      const response = await fetch(`/api/characters/${characterId}/token/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress: mintInput.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't preview this token's market data.");
      if (!data.market) {
        setPreviewError(data.message ?? "No public DEX market pair was found for this mint yet. The token can exist without a public market.");
        return;
      }
      setPreviewMarket(data.market as PreviewMarketData);
    } catch (cause: unknown) {
      setPreviewError(cause instanceof Error ? cause.message : "Couldn't load token market data.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function associate() {
'@
$panel = Replace-ExactOnce -Content $panel -OldText $old -NewText $new -Description 'add preview request handler'

$old = 'onChange={(e) => setMintInput(e.target.value)} placeholder="Token mint address"'
$new = 'onChange={(e) => { setMintInput(e.target.value); setPreviewMarket(null); setPreviewError(null); }} placeholder="Token mint address"'
$panel = Replace-ExactOnce -Content $panel -OldText $old -NewText $new -Description 'clear preview when mint changes'

$old = '          {error && <p className="text-xs text-red-400">{error}</p>}'
$new = @'
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={previewMarketData} disabled={!mintInput.trim() || previewLoading || busy}>
              {previewLoading ? <Loader2 size={14} className="animate-spin" /> : "Preview market data"}
            </Button>
            <span className="text-[11px] text-lf-text-faint">Previewing does not save or publish this token.</span>
          </div>
          {previewError && <p role="status" className="text-xs text-amber-300">{previewError}</p>}
          {previewMarket && (
            <div className="space-y-3 rounded-xl border border-lf-cyan/20 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Live market preview <span className="text-xs font-normal text-lf-text-faint">via {previewMarket.dexId}</span></p>
                <a href={previewMarket.pairUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-lf-cyan hover:underline">Open DexScreener ↗</a>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-[11px] text-lf-text-faint">Price</p><p className="font-medium">{fmtUsd(previewMarket.priceUsd)}</p></div>
                <div><p className="text-[11px] text-lf-text-faint">24h change</p><p className={`font-medium ${(previewMarket.priceChange24hPct ?? 0) >= 0 ? "text-lf-cyan" : "text-red-400"}`}>{previewMarket.priceChange24hPct === null ? "—" : `${previewMarket.priceChange24hPct.toFixed(2)}%`}</p></div>
                <div><p className="text-[11px] text-lf-text-faint">Liquidity</p><p className="font-medium">{fmtUsd(previewMarket.liquidityUsd)}</p></div>
                <div><p className="text-[11px] text-lf-text-faint">24h volume</p><p className="font-medium">{fmtUsd(previewMarket.volume24hUsd)}</p></div>
                <div><p className="text-[11px] text-lf-text-faint">Market cap</p><p className="font-medium">{fmtUsd(previewMarket.marketCapUsd)}</p></div>
                <div><p className="text-[11px] text-lf-text-faint">24h buys</p><p className="font-medium">{previewMarket.buys24h === null ? "—" : previewMarket.buys24h.toLocaleString()}</p></div>
                <div><p className="text-[11px] text-lf-text-faint">24h sells</p><p className="font-medium">{previewMarket.sells24h === null ? "—" : previewMarket.sells24h.toLocaleString()}</p></div>
              </div>
              <iframe
                src={previewMarket.chartEmbedUrl}
                title="Token live market chart preview"
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-64 w-full rounded-lg border border-white/10 bg-black/20"
              />
              <p className="text-[11px] leading-5 text-lf-text-faint">Market figures and transaction counts are provided by DexScreener and may be missing, delayed, or different across pools. This preview does not verify token ownership.</p>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
'@
$panel = Replace-ExactOnce -Content $panel -OldText $old -NewText $new -Description 'add preview UI'

$route = @'
import { NextResponse } from "next/server";
import { z } from "zod";
import { isErrorResponse, requireUser, UUID_RE } from "@/lib/auth";
import { checkMintAddressFormat } from "@/lib/solana/mint";
import { fetchDetailedTokenMarketData } from "@/lib/tokens/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const previewSchema = z.object({
  mintAddress: z.string().trim().min(32).max(44),
});

/**
 * Preview existing public market data without saving or publishing a token.
 * Access is restricted to an authenticated owner of the character.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Character not found." }, { status: 404 });
  }

  const { data: character } = await supabase
    .from("characters")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!character) {
    return NextResponse.json({ error: "Character not found." }, { status: 404 });
  }

  let body: z.infer<typeof previewSchema>;
  try {
    body = previewSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid-looking Solana token mint address." }, { status: 400 });
  }

  const format = checkMintAddressFormat(body.mintAddress);
  if (!format.ok) {
    return NextResponse.json({ error: format.reason }, { status: 400 });
  }

  const market = await fetchDetailedTokenMarketData(body.mintAddress);
  return NextResponse.json(
    {
      market,
      message: market ? undefined : "No public DEX market pair was found for this mint yet. It may be new, illiquid, or not tracked by DexScreener.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
'@

# Check auth helper contract before writing the new route.
$authFile = Join-Path $project "src\lib\auth.ts"
if (-not (Test-Path -LiteralPath $authFile)) {
    throw "Safety check stopped: src\lib\auth.ts not found. No source changes have been saved."
}
$authText = [System.IO.File]::ReadAllText($authFile)
if ($authText -notmatch 'export\s+(async\s+)?function\s+requireUser' -or $authText -notmatch 'export\s+const\s+UUID_RE|export\s+let\s+UUID_RE|export\s+var\s+UUID_RE|export\s+\{[^}]*UUID_RE') {
    throw "Safety check stopped: requireUser or UUID_RE export signature wasn't recognized. No source changes have been saved."
}

# Back up the component, create route parent folders, then save.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $project ".loreforge-code-backups\market-preview-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath $panelPath -Destination (Join-Path $backupDir "token-panel.tsx")

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($panelPath, $panel, $utf8NoBom)
New-Item -ItemType Directory -Path (Split-Path -Parent $routePath) -Force | Out-Null
[System.IO.File]::WriteAllText($routePath, $route, $utf8NoBom)

Write-Host "`nToken market preview feature added." -ForegroundColor Green
Write-Host "Updated: $panelRelative"
Write-Host "Created: $routeRelative"
Write-Host "Backup:  $backupDir"
Write-Host "`nThe preview requires authentication and verifies character ownership. It does not save or publish the entered mint." -ForegroundColor Cyan
Write-Host "`nNext run: npm run lint ; npx tsc --noEmit ; npm run build" -ForegroundColor Cyan
