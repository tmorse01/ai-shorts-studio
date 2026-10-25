import { generateFixtures } from './generateFixtures'

export default async function globalSetup(): Promise<void> {
  await generateFixtures()
}
