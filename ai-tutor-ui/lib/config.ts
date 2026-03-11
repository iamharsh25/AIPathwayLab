/**
 * Central config for the AI Pathway Lab frontend.
 *
 * To override, create a `.env.local` file in ai-tutor-ui/ with:
 *   NEXT_PUBLIC_API_URL=http://localhost:5236
 *
 * The default below works for standard local development.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5236";
