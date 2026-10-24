// Plain-language lines for the AI settings and the cost dialog. Pure, so the wording and the money
// rules can be tested without rendering anything.
import { visionAwaitingShotCount, type AnalysisFile } from '@shared/analysis/analysis'
import { formatUsd, remainingUnderCap, type AiStatus } from '@shared/ai/aiSettings'

/** This month's usage, from the token counts the API reported. */
export function usageLine(status: AiStatus): string {
  const { inputTokens, outputTokens, costUsd } = status.usage
  return `${formatTokens(inputTokens)} input and ${formatTokens(outputTokens)} output tokens, about ${formatUsd(costUsd)}`
}

/** What is left under the monthly cap, or that there is no cap. */
export function capLine(status: AiStatus): string {
  const cap = status.settings.monthlySpendCapUsd
  if (cap === null) return 'No monthly cap is set.'
  if (status.capStatus === 'reached') {
    return `The ${formatUsd(cap)} monthly cap is reached. Vision is paused until it is raised or the month changes.`
  }
  const left = remainingUnderCap(status.usage.costUsd, cap) ?? 0
  return `${formatUsd(left)} left under the ${formatUsd(cap)} monthly cap.`
}

/** Whether a key is saved, or what is missing. */
export function keyLine(status: AiStatus): string {
  if (!status.keyStorageAvailable) {
    return 'Secure storage is not available on this computer, so a key cannot be saved.'
  }
  return status.hasKey ? 'A key is saved on this computer.' : 'No key is saved yet.'
}

/** The first project waiting on the cost answer before its vision pass, with the shots it would cover. */
export function pendingVisionPass(
  filesByFolder: Record<string, AnalysisFile>
): { folderPath: string; shots: number } | undefined {
  for (const [folderPath, file] of Object.entries(filesByFolder)) {
    const shots = visionAwaitingShotCount(file)
    if (shots > 0) return { folderPath, shots }
  }
  return undefined
}

function formatTokens(count: number): string {
  return count.toLocaleString('en-US')
}

/** Parses the cap field: blank means no cap. Returns undefined when the text is not a usable amount. */
export function parseCapInput(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : undefined
}
