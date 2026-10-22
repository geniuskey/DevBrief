from alembic import context
from app.core.db import make_engine
from app.core.settings import get_settings
from app.models.entities import Base

config = context.config
if context.is_offline_mode():
    context.configure(url=get_settings().database_url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with make_engine(get_settings().database_url).connect() as connection:
        sqlite = connection.dialect.name == "sqlite"
        if sqlite:
            # batch_alter_table rebuilds tables via DROP; with FK enforcement on, that
            # cascades into (or is blocked by) referencing rows. The PRAGMA is ignored
            # inside a transaction, so set it before migrations begin.
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            connection.commit()
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
