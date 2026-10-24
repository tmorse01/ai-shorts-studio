// An error whose message is safe to show to the user. IPC dispatch passes it through as the
// failure message instead of the generic "<channel> failed." text.
export class UserFacingError extends Error {
  readonly details: string | undefined

  constructor(message: string, details?: string) {
    super(message)
    this.name = 'UserFacingError'
    this.details = details
  }
}
