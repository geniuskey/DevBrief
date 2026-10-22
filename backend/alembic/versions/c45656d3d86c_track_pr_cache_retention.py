"""Track PR cache age; safely backfill databases containing existing reports."""

import sqlalchemy as sa

from alembic import op

revision = "c45656d3d86c"
down_revision = "c8fba9c99425"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pull_requests", sa.Column("cached_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE pull_requests SET cached_at = CURRENT_TIMESTAMP WHERE cached_at IS NULL")
    with op.batch_alter_table("pull_requests") as batch:
        batch.alter_column("cached_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade():
    with op.batch_alter_table("pull_requests") as batch:
        batch.drop_column("cached_at")
