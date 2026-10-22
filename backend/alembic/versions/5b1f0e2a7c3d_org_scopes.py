"""Organization-wide scopes: discovered repositories and team organizations."""

import sqlalchemy as sa

from alembic import op

revision = "5b1f0e2a7c3d"
down_revision = "c45656d3d86c"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("repositories") as batch:
        batch.add_column(sa.Column("discovered", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("pushed_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("teams") as batch:
        batch.add_column(sa.Column("organizations", sa.JSON(), nullable=False, server_default="[]"))


def downgrade():
    with op.batch_alter_table("teams") as batch:
        batch.drop_column("organizations")
    with op.batch_alter_table("repositories") as batch:
        batch.drop_column("pushed_at")
        batch.drop_column("discovered")
