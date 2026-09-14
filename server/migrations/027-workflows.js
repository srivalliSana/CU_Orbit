/**
 * Migration 027 — Workflow Builder.
 *
 * Creates Workflows — one trigger + one action per row (not Slack's
 * multi-step visual canvas, but genuinely no-code): message_contains,
 * member_joined, or schedule as a trigger; post_message or add_list_item
 * as the action. Evaluated inline from createMessage()/the two channel-join
 * endpoints for the event triggers, and by a once-a-minute sweep
 * (runScheduledWorkflows) for the schedule trigger.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/027-workflows.js --dry-run
 *   node migrations/027-workflows.js
 */

const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');
const DB = process.env.DB_NAME || 'cu_orbit';

const sequelize = new Sequelize(DB, process.env.DB_USER || 'root', process.env.DB_PASS || '', {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
});

const tableExists = async (table) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table`,
        { replacements: { db: DB, table }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    if (await tableExists('Workflows')) {
        console.log('  skip  Workflows (already present)');
    } else {
        console.log('  add   table Workflows');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE Workflows (
                    id             CHAR(36)     NOT NULL PRIMARY KEY,
                    channel_id     CHAR(36)     NOT NULL,
                    name           VARCHAR(120) NOT NULL,
                    created_by     VARCHAR(255) NOT NULL,
                    is_active      TINYINT(1)   NOT NULL DEFAULT 1,
                    trigger_type   ENUM('message_contains','member_joined','schedule') NOT NULL,
                    trigger_config JSON         NULL,
                    action_type    ENUM('post_message','add_list_item') NOT NULL,
                    action_config  JSON         NULL,
                    last_run_at    DATETIME     NULL,
                    createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_workflows_channel (channel_id),
                    KEY idx_workflows_trigger_active (trigger_type, is_active)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
