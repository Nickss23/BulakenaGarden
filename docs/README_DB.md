Bulakena Garden — Database setup (phpMyAdmin)

1) Open phpMyAdmin and create/import the schema:
   - In phpMyAdmin, choose the SQL tab for a new or existing database.
   - Import or paste the contents of `db/schema.sql`.
   - This creates `garden_db` and the tables: `users`, `products`, `orders`, `order_items`, `appointments`, `feedback`, `settings`.

2) Verify `includes/config.php` matches your MySQL credentials:
   - `includes/config.php` expects database `garden_db` by default.
   - Update `$username`, `$password` in `includes/config.php` if necessary.

3) Add the account profile columns to `users`
   - Run `tools/migrations/migrate_user_profile.php` once after importing the schema.
   - It adds `phone`, `region`, `province`, `municipality`, `barangay`, and `street_address`.
   - The signup flow writes these fields, and checkout reads them back for the saved customer summary.

4) Order storage is now database-only
   - `website/api/save_order.php` inserts into `orders` + `order_items`
   - `admin/api/get_orders.php` reads from MySQL for admin use
   - `website/api/orders_list.php` reads from MySQL
   - `admin/api/update_order_status.php` updates MySQL directly

5) Next steps to integrate backend endpoints:
   - Add `admin` authentication or `users.role = 'admin'` checks for protected endpoints.
