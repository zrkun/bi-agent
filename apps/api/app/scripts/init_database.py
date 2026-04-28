import argparse
import os


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Initialize BI Agent database tables and seed data."
    )
    parser.add_argument(
        "--database-url",
        help="PostgreSQL connection URL. Defaults to BI_AGENT_DATABASE_URL or app default.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.database_url:
        os.environ["BI_AGENT_DATABASE_URL"] = args.database_url

    from app.database import DATABASE_URL, count_database_rows, init_database

    init_database()

    print(f"Initialized database: {DATABASE_URL}")
    print("Table row counts:")
    for table_name, row_count in count_database_rows():
        print(f"- {table_name}: {row_count}")


if __name__ == "__main__":
    main()
