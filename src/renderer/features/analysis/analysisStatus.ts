// Plain-language analysis status for a media card. Pure, so the wording and the rules are testable.
import { ANALYSIS_STAGES, recordSummary, type AnalysisRecord } from '@shared/analysis/analysis'

export function analysisStatusLabel(record: AnalysisRecord): string {
  const summary = recordSummary(record)
  if (summary === 'failed') return 'Analysis failed'
  if (summary === 'running') return 'Analyzing'
  if (summary === 'pending') return 'Waiting to analyze'
  const allSkipped = ANALYSIS_STAGES.every((stage) => record.stages[stage].status === 'skipped')
  // Skipped stages have no provider set up yet, so nothing was actually analyzed.
  return allSkipped ? 'Not analyzed yet' : 'Analyzed'
}

/** The message of the first failed stage, for the card. Undefined when no stage failed. */
export function analysisErrorText(record: AnalysisRecord): string | undefined {
  for (const stage of ANALYSIS_STAGES) {
    const error = record.stages[stage].error
    if (error) return error.message
  }
  return undefined
}
