const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
// Connects to the remote Nexa Spatial DB
const pool = new Pool({
  host: process.env.DB_HOST || '15.235.235.168',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'nexa_spatial_db',
  user: process.env.DB_USER || 'magpi_admin',
  password: process.env.DB_PASSWORD || 'Nexa!Secure_admin_99',
});

// Test DB Connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to PostgreSQL Nexa Spatial DB!');
  release();
});

// ==========================================
// ROUTES
// ==========================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MagPI API is running' });
});

// Fetch Analyst Review Queue
app.get('/api/queue/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, raw_title, extracted_subject, extracted_predicate, source_url, published_at, status 
       FROM atlas.analyst_review_queue 
       WHERE status = 'PENDING' 
       ORDER BY published_at DESC;`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Resolve Queue Item (Approve, Map, or Discard)
app.post('/api/queue/resolve', async (req, res) => {
  const { queue_id, action, target_type, target_id, target_name } = req.body;
  // action: 'APPROVE', 'DISCARD'

  if (!queue_id || !action) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch the queue item
    const queueItemRes = await client.query('SELECT * FROM atlas.analyst_review_queue WHERE id = $1', [queue_id]);
    if (queueItemRes.rowCount === 0) {
      throw new Error('Queue item not found');
    }
    const item = queueItemRes.rows[0];

    if (action === 'APPROVE') {
      if (!target_type || !target_id) {
        throw new Error('Target type and ID required for APPROVE');
      }

      // Create affiliation edge
      await client.query(
        `INSERT INTO atlas.affiliations 
         (source_type, source_id, target_type, target_id, relationship_type, start_date)
         VALUES ('osint_event', 0, $1, $2, $3, $4)`,
        [target_type, target_id, item.extracted_predicate, item.published_at]
      );
      
      // Update queue status
      await client.query(
        `UPDATE atlas.analyst_review_queue SET status = 'RESOLVED' WHERE id = $1`,
        [queue_id]
      );
    } else if (action === 'DISCARD') {
      // Update queue status
      await client.query(
        `UPDATE atlas.analyst_review_queue SET status = 'DISCARDED' WHERE id = $1`,
        [queue_id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, message: `Item ${action.toLowerCase()} successfully.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resolving queue item:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Search Entities (for the Analyst to manually select targets)
app.get('/api/entities/search', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.json([]);
  }

  try {
    const searchTerm = `%${query}%`;
    
    // Search humans
    const humansRes = await pool.query(
      `SELECT id, name, 'human_entity' as type FROM atlas.human_entities WHERE name ILIKE $1 LIMIT 5`,
      [searchTerm]
    );
    
    // Search corps
    const corpsRes = await pool.query(
      `SELECT id, name, 'corporate_entity' as type FROM atlas.corporate_entities WHERE name ILIKE $1 LIMIT 5`,
      [searchTerm]
    );

    res.json([...humansRes.rows, ...corpsRes.rows]);
  } catch (error) {
    console.error('Error searching entities:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// User Settings endpoints
app.get('/api/user/settings', async (req, res) => {
  // For MVP, we use a static user_id, since auth isn't fully integrated yet
  const userId = req.query.user_id || 'default_user';
  try {
    const result = await pool.query(
      `SELECT youtube_api_key FROM atlas.user_settings WHERE user_id = $1`,
      [userId]
    );
    if (result.rowCount === 0) {
      return res.json({});
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/user/settings', async (req, res) => {
  const userId = req.body.user_id || 'default_user';
  const { youtube_api_key } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO atlas.user_settings (user_id, youtube_api_key, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP) 
       ON CONFLICT (user_id) 
       DO UPDATE SET youtube_api_key = EXCLUDED.youtube_api_key, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, youtube_api_key]
    );
    res.json({ success: true, settings: result.rows[0] });
  } catch (error) {
    console.error('Error saving user settings:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`MagPI API listening on port ${port}`);
});
