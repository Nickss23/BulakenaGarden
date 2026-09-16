# Project Structure

This project separates the admin dashboard and public website into their own
folders while keeping shared backend endpoints at the web root.

## Main Folders

- `admin/` - admin dashboard frontend files.
- `admin/api/` - admin-only PHP endpoints.
- `website/` - public customer-facing website pages, CSS, and shared browser JavaScript.
- `website/api/` - customer-facing and shared PHP endpoints used by the website and admin reports.
- `includes/` - shared PHP configuration and helper files.
- `images/` - bundled site images used by the public pages.
- `uploads/` - uploaded product, review, and feedback files.
- `data/` - local runtime data such as PHP session files.
- `orders/` - order-related runtime/debug output.
- `logs/` - application error logs.
- `docs/` - setup notes and developer documentation.
- `tests/` - manual/local PHP test scripts.
- `tools/` - maintenance utilities.
- `tools/migrations/` - one-time database migration scripts.
- `tools/debug/` - debug-only helper scripts.
- `vendor/` - Composer dependencies.

## Web Root Files

Root `.html` files are lightweight redirect wrappers that preserve old URLs and
forward visitors to the organized `website/` or `admin/` folders. The root
folder should stay mostly clear of application code.
