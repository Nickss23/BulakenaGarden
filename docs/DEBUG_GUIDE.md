# Cart Storage Debugging Guide

## 🔧 Critical Bug Found & Fixed

**Issue**: cart.html was looking for session email in the wrong localStorage key.
- **app.js** stores session with key: `bulakena_session_v1`
- **cart.html** was looking for key: `session_email` ❌ (WRONG)

**FIX**: cart.html now checks both keys, prioritizing `bulakena_session_v1`.

This was the root cause of the "Your cart is empty" issue.

---

## Step-By-Step Verification

### Step 1: Test the Fix
1. Go to `products.html`
2. Login with your credentials
3. Add an item to cart
4. Click the cart icon to view cart.html
5. Your cart should now display the items ✅

### Step 2: Verify Session Persistence (if still issues)
Open Developer Console (F12) and verify:

```javascript
// Should return your email
localStorage.getItem('bulakena_session_v1')

// Should return your cart items in JSON
localStorage.getItem('bulakena_cart_v1:your.email@example.com')
```

---

## Overview (if you need detailed debugging)
I've added comprehensive logging to help diagnose cart storage issues. Follow these steps if you still see problems.

## Step 1: Open Browser Developer Console
1. Open your browser
2. Press `F12` to open Developer Tools
3. Click the **Console** tab
4. Keep the console visible as you perform the next steps

## Step 2: Add an Item to Cart
1. Navigate to `products.html`
2. Click on any product image to open the product detail page
3. Change the quantity if desired (default is 1)
4. Click **"Add to cart"** button
5. **In the Developer Console**, you should see logs starting with `[ADD_TO_CART]` and `[SAVE_CART_ITEMS]`

### What to look for:
```
[GET_CART_KEY] Session email: your.email@example.com Full key: bulakena_cart_v1:your.email@example.com
[SAVE_CART_ITEMS] Key: bulakena_cart_v1:your.email@example.com Items: [...]
```

**⚠️ If you see:**
```
[GET_CART_KEY] Session email is empty. Raw session: [empty]
```
This means the session email was NOT saved when you logged in. Check the login flow.

## Step 3: Navigate to Cart Page
After adding items, click the cart icon (🛒) to navigate to `cart.html`

### What to look for in Console:
1. **Session info:**
   ```
   [CART] Raw session_email from localStorage: your.email@example.com
   [CART] Cart storage key: bulakena_cart_v1:your.email@example.com
   ```

2. **Cart data lookup:**
   ```
   [CART] getCartItems - Checking per-user key: bulakena_cart_v1:your.email@example.com
   [CART] Found items in user key: bulakena_cart_v1:your.email@example.com [array of items]
   ```

## Troubleshooting Checklist

### Problem: "Your cart is empty" on cart.html
**Check these console logs:**

1. ✅ Is the session email stored?
   - Look for: `[CART] Raw session_email from localStorage: ...`
   - If EMPTY, session wasn't saved during login

2. ✅ Is the storage key being constructed correctly?
   - Look for: `[CART] Cart storage key: bulakena_cart_v1:your.email@example.com`
   - If NULL, session email is missing

3. ✅ Were items saved when "Add to cart" was clicked?
   - Look for: `[SAVE_CART_ITEMS] Key: bulakena_cart_v1:...`
   - If MISSING, Add to Cart handler didn't save

4. ✅ Are items in localStorage?
   - Look for: `[CART] getCartItems - Checking per-user key: ...`
   - If the key shows empty string, items weren't saved

5. ✅ Check localStorage directly in console
   - Type: `localStorage.getItem('bulakena_cart_v1:your.email@example.com')`
   - Should show: `[{"id":1,"title":"...","price":100,"qty":1,"img":"..."}]`

### Problem: Session email is empty/null
This means the login flow is not saving the session. The issue is likely in app.js's authentication code.

**Quick test:**
1. Login on any page
2. Open console and type: `localStorage.getItem('bulakena_session_v1')`
3. If it returns `null`, the session is not being saved by app.js

### Problem: Storage key mismatch
If "Add to cart" saves to one key but cart.html reads from another:
- Look for multiple `bulakena_cart_v1:` keys with different emails
- This would indicate email normalization differences between pages

## Debug Files Modified

The following files have enhanced logging:

### `app.js`
- **`getCartStorageKey()`** - Logs session email and constructed key
- **`getCartItems()`** - Logs key, raw value, and parsed items
- **`saveCartItems()`** - Logs what's being saved and where
- **`addToCart()`** - Logs product being added, session email, and full localStorage state

### `cart.html`
- **`getSessionEmail()`** - **FIXED** to check correct session key (`bulakena_session_v1`)
- **`getCartStorageKey()`** - Logs email normalization and final key
- **`getCartItems()`** - Logs all localStorage keys and detailed lookups
- **`DOMContentLoaded`** - Logs session info and available globals

## Example Success Flow

### When Working Correctly:

**Product page (product.html) "Add to cart":**
```
[GET_CART_KEY] Session email: user@example.com Full key: bulakena_cart_v1:user@example.com
[GET_CART_ITEMS] Key: bulakena_cart_v1:user@example.com Raw value: [...]
[SAVE_CART_ITEMS] Key: bulakena_cart_v1:user@example.com Items: [...]
[ADD_TO_CART] Product: Rose Bushes Qty: 1
[ADD_TO_CART] Session email: user@example.com
...
✅ "Added to cart" toast appears
```

**Cart page (cart.html) load:**
```
[CART] Raw session_email from localStorage: user@example.com
[CART] getCartStorageKey - Raw email: user@example.com Normalized: user@example.com
[CART] getCartStorageKey - Final key: bulakena_cart_v1:user@example.com
[CART] getCartItems - Checking per-user key: bulakena_cart_v1:user@example.com
[CART] getCartItems - Raw value from key: [{"id":1,"title":"Rose Bushes","price":150,"qty":1,...}]
[CART] Found items in user key: bulakena_cart_v1:user@example.com [...]
✅ Cart displays 1 item
```

## Next Steps After Gathering Console Output

Once you've collected the console logs, share:
1. The console output when clicking "Add to cart"
2. The console output when loading cart.html
3. What `localStorage` contains (type in console: `localStorage`)
4. Any error messages in red

This will help identify exactly where the cart data is being stored or lost.
