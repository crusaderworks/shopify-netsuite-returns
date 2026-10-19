import { json } from '../utils/response.js';

export async function healthCheck(env) {
  try {
    await env.DB.prepare('SELECT 1').first();

    return json({
      success: true,
      message: 'NetSuite Returns Worker is running',
      database: 'connected',
    });
  } catch (error) {
    console.error('Health check failed:', error);

    return json({
      success: false,
      message: 'Database connection failed',
    }, 500);
  }
}