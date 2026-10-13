# Dhulia Cycle Company — React + Supabase + Netlify

A full-stack starter for a cycle store with product catalog, categories, search, wishlist, cart, Indian address checkout, server-validated Cash on Delivery orders, atomic stock decrement, customer sign-in, order history, admin product/stock tools, dispatch tracking, and optional transactional email notifications.

## Run locally

1. Install Node.js 20+ and run `npm install`.
2. Create a Supabase project. Paste `supabase/schema.sql` into SQL Editor and execute once.
3. Copy `.env.example` to `.env`. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase publishable key). **Never put service-role key in a VITE_ variable.**
4. Run `npm run dev` to view the storefront. Note: the server checkout endpoints only run on Netlify or with `netlify dev` (Netlify CLI).
5. For Netlify, import the GitHub repository. Build command `npm run build`, publish directory `dist`. Set ALL variables from `.env.example` in Netlify environment variables. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAIL` are server-only variables.
6. In Supabase Authentication URL configuration set Site URL and redirect URLs to the Netlify domain.
7. To grant admin access: first sign up normally, then in Supabase SQL Editor run `update public.profiles set role='admin' where id=(select id from auth.users where email='YOUR_ADMIN_EMAIL');`. If a profile row does not yet exist, run `insert into public.profiles(id,email,role) select id,email,'admin' from auth.users where email='YOUR_ADMIN_EMAIL' on conflict(id) do update set role='admin';`. Only do this for trusted store owner accounts.
8. Configure Resend verified domain and `MAIL_FROM`, plus `OWNER_EMAIL`. If not configured, checkout still works but no email is sent. Email delivery failures are logged and do not cancel the order.
9. Replace demo products, photos, shipping rules, branding details and publish actual policies. Test end-to-end before launch.

## Features and limitations

- COD is the only live checkout method. **Online payment is not implemented**; add a gateway with server-side signature/webhook verification before offering it.
- Customer order confirmation appears on Thank You page; optional email includes an HTML order summary, not a tax-compliant PDF invoice. Invoice/PDF and refund workflows need further work.
- The server accepts guest checkout. Guest orders cannot be viewed in My Orders after signup; logged-in orders can.
- Stock is reduced atomically on COD placement. Cancellation currently does not automatically restock. Implement restocking and cancellation policy before production use.
- Sample shipping: ₹299 for orders below ₹10,000; free otherwise. Update both checkout function and SQL RPC for your actual delivery policy. GST is set to zero in the demo; configure taxes with an accountant.
- Dispatch status email is sent for `dispatched` and `delivered` when Resend is configured. A tracking link must be entered manually by admin. No courier API integration.
- Product images are URLs. Upload and storage UI can be added with Supabase Storage.
- Email receipt may be sent to owner/customer only when Resend is configured. Verify consent and your transactional email settings.
- This is a development-ready source project, not a verified live production deployment. Security, rate limits, spam/bot prevention, abuse controls, taxes, shipping coverage, cancellation/refund flows and compliance should be reviewed before accepting real customer orders.

## Architecture

`src/` React SPA, `supabase/schema.sql` database/RLS/RPC, `netlify/functions/checkout.cjs` trusted order creation, `netlify/functions/dispatch.cjs` authenticated admin status updates, `netlify.toml` deployment routes.

## Brand catalog additions
The Shop page now filters Welcare, Huge, Gang, and Giant and includes two non-purchasable sample listings for each brand. They are placeholders, not verified official models, product photographs, stock or prices. The sample photographs are generic. Run `supabase/brand_catalog.sql` after `schema.sql` if you want inactive placeholder records in the database. Confirm real SKUs, names, prices, images and stock before activating items in Admin.

## Brand reference catalog (October 2026)
Eight researched reference models in Welcare, Huge, Gang and Giant. Stock zero; not purchasable. All photos are generic illustrative placeholders, not original model images. Confirm inventory, sale price, model variant and image licensing before enabling. Source references: giantindia.com/collections/all-bikes ; bajajfinserv.in/explore-huge-cycles ; third-party product listings for Gang Zapper and Welcare WC 700.


## Client demonstration status
- Welcare is classified as **Exercise Bikes**.
- Brand filter runtime bug fixed.
- Original product images must be supplied by Dhulia Cycle Company or approved by each brand. Existing stock photos are NOT model photos and must be replaced before client presentation.
- This ZIP has not been deployed. Netlify and Supabase must be configured separately.

## Vercel deployment (preferred)
1. Push the `dhulia-cycle-company` directory to a new GitHub repository.
2. Vercel > Add New > Project > Import repository. Root directory is `/` if files are at repository root, otherwise `dhulia-cycle-company`.
3. Framework preset Vite; build `npm run build`; output `dist`.
4. Set environment variables from `.env.example` in Vercel project settings. NEVER expose `SUPABASE_SERVICE_ROLE_KEY` as a `VITE_` variable.
5. Run `supabase/schema.sql` then `supabase/brand_catalog.sql` in Supabase SQL Editor. Confirm real stock and product photos before enabling purchases.
6. Deploy, then verify `/`, `/shop`, `/checkout`, `/api/checkout` and `/api/dispatch`. API endpoints require proper methods and configuration.
7. Configure Resend verified sender and `OWNER_EMAIL` to enable receipt/dispatch emails.
Note: original manufacturer photos, actual inventory, real invoice PDF, and online payment are not yet implemented. This is a testing build, not a production store.
