import os, sys
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL") or sys.argv[1] if len(sys.argv) > 1 else None
DB_NAME   = os.environ.get("DB_NAME")   or sys.argv[2] if len(sys.argv) > 2 else None

if not MONGO_URL or not DB_NAME:
    print("Usage: python3 migrate_to_b2b.py <MONGO_URL> <DB_NAME>")
    sys.exit(1)

client = MongoClient(MONGO_URL)
db = client[DB_NAME]
no_tag = {"$or": [{"biz_type": {"$exists": False}}, {"biz_type": None}]}

for coll in ["parties", "invoices", "purchases", "expenses", "payments"]:
    r = db[coll].update_many(no_tag, {"$set": {"biz_type": "b2b"}})
    print(f"  {coll}: {r.modified_count} tagged as b2b")

print("Migration complete.")
client.close()
