/**
 * Launch of paid plans (docs/subscriptions-plan.md, section 13). Idempotent.
 *
 *   npm run build
 *   npm run billing:launch -- --trial-ends=YYYY-MM-DD
 *
 * Sets `launchedAt`, gives every brand without a subscription a trial to the start of
 * that date in the brand timezone, then repeats the pass a minute later for brands
 * created during the launch. Runs from `dist`: Nest DI needs decorator metadata.
 */
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BillingLaunchModule } from '../modules/billing/launch/billing-launch.module.js';
import { BillingLaunchService } from '../modules/billing/launch/services/billing-launch.service.js';
import regularExpressions from '../shared/regular-expressions.js';

const SECOND_PASS_DELAY_MS = 60_000;

function parseTrialEnds(argv: string[]): string {
  const arg = argv.find((a) => a.startsWith('--trial-ends='));
  const value = arg?.slice('--trial-ends='.length) ?? '';
  if (!regularExpressions.calendarDate.test(value))
    throw new Error('Usage: billing-launch --trial-ends=YYYY-MM-DD');
  return value;
}

async function main(): Promise<void> {
  const trialEndsOn = parseTrialEnds(process.argv.slice(2));
  const logger = new Logger('BillingLaunch');
  const app = await NestFactory.createApplicationContext(BillingLaunchModule);
  try {
    const launch = app.get(BillingLaunchService);
    const first = await launch.launch(trialEndsOn, null);
    logger.log(`First pass: ${JSON.stringify(first)}`);
    await new Promise((resolve) => setTimeout(resolve, SECOND_PASS_DELAY_MS));
    const second = await launch.launch(trialEndsOn, null);
    logger.log(`Second pass: ${JSON.stringify(second)}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
