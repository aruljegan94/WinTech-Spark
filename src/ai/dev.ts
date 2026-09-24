'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/invoice-follow-up.ts';
import '@/ai/flows/generate-invoice-image.ts';
import '@/ai/flows/generate-notifications.ts';
import '@/ai/flows/analyze-sales.ts';
