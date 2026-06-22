import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const policies = [
  {
    topic: 'store_overview',
    title: 'About Spur Shop',
    content: `Spur Shop is an Indian online lifestyle and essentials store offering a curated collection of clothing, home goods, electronics accessories, and personal care products. We focus on quality, affordability, and a seamless shopping experience.

Our inventory includes:
- Apparel & accessories for men and women
- Home & living essentials
- Tech accessories (phone cases, chargers, cables, power banks)
- Personal care and wellness products
- Gift cards in denominations of ₹250, ₹500, ₹1,000

We source products directly from verified manufacturers across India to ensure quality while keeping prices competitive. We ship to all pincodes across India.`,
  },
  {
    topic: 'shipping',
    title: 'Shipping Policy',
    content: `We ship to all pincodes across India, including Jammu & Kashmir and the Northeast states. We do not currently ship internationally.

Shipping options and rates:
- Standard (5-8 business days): ₹49 — Free on orders over ₹499
- Express (2-3 business days): ₹149
- Same-day delivery: Available in select metro cities (Mumbai, Delhi, Bangalore, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad) — ₹249. Order before 12 PM IST.

Processing time: Orders typically process within 24 hours (business days) after payment confirmation. During festive seasons, processing may take up to 48 hours.

Tracking: A tracking number is shared via SMS and email once your order ships. You can also track in your account dashboard under "Orders".

Delivery partners: We use Delhivery, Blue Dart, India Post, and XpressBees depending on your pincode and service availability.

Delivery issues:
- If your tracking hasn't updated in 5+ business days, contact us and we'll investigate with the courier partner
- If a package is marked delivered but you haven't received it, check with your security desk or neighbours first. If still missing, we'll initiate a courier investigation within 48 hours
- We are not responsible for delays caused by the courier partner, severe weather, or festivals`,
  },
  {
    topic: 'returns_refunds',
    title: 'Returns & Refunds Policy',
    content: `We accept returns within 7 days of delivery for most items in new, unused condition with original packaging.

Conditions:
- Items must be unworn, unwashed, and with all tags attached
- Electronics accessories must be unopened
- Personal care items cannot be returned due to hygiene regulations
- Final sale items are marked on the product page and cannot be returned
- Return is accepted only if the item is in re-saleable condition

Return process:
1. Log into your account and go to Orders → select the item → Request Return
2. Select a pickup address and preferred pickup slot
3. Our courier partner will pick up the item within 2-4 business days
4. No need to print a label — the pickup person will bring one
5. Refunds are processed within 5-7 business days after we receive and inspect the return

Refund details:
- Refunds go back to your original payment method (UPI, card, or wallet)
- For Cash on Delivery orders, refund is processed to your bank account (you'll receive a refund link via SMS/email)
- You'll receive a confirmation email/SMS once the refund is issued
- Shipping costs are non-refundable unless the return is due to our error or a defective item
- If you received a damaged or incorrect item, we'll schedule a free pickup and issue a full refund including shipping

Exchanges: We don't offer direct exchanges. Return the item for a refund and place a new order.

Sale items: Final sale items cannot be returned. Regular sale items follow the standard 7-day policy.`,
  },
  {
    topic: 'payment',
    title: 'Payment Methods',
    content: `We accept the following payment methods:
- UPI (Google Pay, PhonePe, Paytm, BHIM, CRED)
- Credit & Debit Cards (Visa, Mastercard, RuPay, American Express)
- Net Banking (all major banks — SBI, HDFC, ICICI, Axis, etc.)
- Paytm Wallet
- Cash on Delivery (COD) — available on orders up to ₹10,000
- EMI — available on orders above ₹3,000 with leading banks (HDFC, ICICI, SBI, Kotak)

All payments are processed securely through encrypted connections. We use Razorpay as our payment gateway partner. We do not store full card numbers or UPI details on our servers.

GST invoice: A GST invoice is included in your package. You can also download it from your account under Orders.

Discount codes and promo codes can be applied at checkout. Only one promo code can be used per order. Codes cannot be applied to past orders.

Gift cards:
- Available in ₹250, ₹500, and ₹1,000 denominations
- Delivered via email within 1 hour of purchase
- Never expire
- Can be used towards any purchase including shipping
- Cannot be reloaded or exchanged for cash`,
  },
  {
    topic: 'orders',
    title: 'Order Management',
    content: `Order processing: Orders are processed within 24 hours (business days) after payment is confirmed. You'll receive an order confirmation email and SMS.

Order cancellation:
- You can cancel within 1 hour of placing the order by going to Orders in your account
- After 1 hour, the order may already be in processing. Contact support and we'll try to intercept it
- Once shipped, orders cannot be cancelled. You can initiate a return after delivery instead

Order modification:
- Address changes can be made within 1 hour of placing the order
- After that, we cannot guarantee changes as the order may have entered processing
- Contact support immediately if you need to change your shipping address or phone number

Order tracking:
- Tracking information is shared via SMS and email when your order ships
- You can view tracking in your account under Orders
- If tracking hasn't updated in 3+ business days, reach out to us

Lost or stolen packages:
- If tracking shows delivered but you haven't received it, check with your building security or neighbours
- Contact us within 3 days of the delivery date
- We'll open a courier investigation and keep you updated`,
  },
  {
    topic: 'account',
    title: 'Account Management',
    content: `Creating an account: You can create an account with your email address or phone number, or sign in with Google. An account lets you track orders, save addresses, view order history, and manage returns.

Password reset: Go to the login page and click "Forgot Password". An OTP will be sent to your registered email or phone. Enter the OTP to reset your password.

Updating profile: You can update your name, email, phone number, shipping addresses, and saved payment methods under Account Settings.

Order history: All past and current orders are visible in your account. Orders older than 2 years are archived.

Deleting your account: Contact support to request account deletion. Your personal data will be removed within 30 days. Order records are retained for tax and accounting purposes as per Indian regulations.

Wishlist: You can save items to your wishlist. Items in your wishlist are not reserved — pricing and availability may change.`,
  },
  {
    topic: 'support',
    title: 'Customer Support',
    content: `Our support team is available during the following hours:
- Monday to Saturday: 9 AM to 9 PM IST
- Sunday: 10 AM to 6 PM IST

Contact methods:
- Live chat on our website (fastest response, typically under 2 minutes during business hours)
- Email: support@spurshop.com — we respond within 12 hours on business days
- Phone: 1800-123-SPUR (7787) — Available Mon–Sat, 10 AM–7 PM IST
- WhatsApp: +91-98765-43210 — Available during business hours
- Social media (DM via Instagram/Facebook): within 3-4 hours during business hours

Response times:
- Live chat: under 2 minutes during business hours
- Email: within 12 hours
- Phone: immediate during operating hours
- WhatsApp: within 1 hour during business hours

Holiday hours: We are closed on major Indian holidays — Republic Day (Jan 26), Independence Day (Aug 15), Gandhi Jayanti (Oct 2), Diwali, Holi, Eid, and Christmas. Support will resume the next business day.

Urgent issues: For time-sensitive issues like address changes or cancellation, live chat or WhatsApp is the fastest option.`,
  },
  {
    topic: 'products',
    title: 'Product Information',
    content: `Our product catalog covers:

Apparel: T-shirts, kurtas, hoodies, jackets, dresses, and accessories for men and women. Sizes range from XS to 3XL. Each product page includes a size guide with measurements. We use standard Indian sizing.

Home goods: Decorative items, kitchen accessories, storage solutions, and small furniture. Dimensions are listed on each product page.

Tech accessories: Phone cases (compatible with iPhone and Samsung models), charging cables, power banks (10,000mAh and 20,000mAh), screen protectors, and wireless earbuds. Compatibility information is provided on each listing.

Personal care: Skincare, grooming kits, and wellness items. Ingredient lists are available on each product page. We do not test on animals.

Product availability:
- Stock levels are shown on each product page
- "In Stock" items ship within 24 hours
- "Low Stock" items are limited — order soon
- "Sold Out" items may be restocked. Tap "Notify Me" on the product page to get an email when back in stock

Sizing and fit:
- Each product has a size guide linked on the page
- Our apparel generally runs true to Indian standard sizing
- If you're between sizes, we recommend sizing up
- Customer reviews often include fit notes — check those before ordering

Product care:
- Care instructions are listed on each product page and on the item's tag
- Most apparel is machine washable — check specific tags for details
- Electronics accessories should be cleaned with a soft, dry cloth
- Keep power banks away from direct sunlight and extreme heat`,
  },
  {
    topic: 'privacy',
    title: 'Privacy & Security',
    content: `We take your privacy seriously. Here's how we handle your data:

What we collect:
- Name, email, phone number, shipping address, and payment information (necessary to process orders)
- Order history and browsing behaviour (to improve your experience)
- Communication preferences

How we use your data:
- Process and fulfil orders
- Send order updates and shipping confirmations via SMS and email
- Provide customer support
- Send occasional promotional emails and WhatsApp messages (only with your consent — you can unsubscribe anytime)

We never sell your personal information to third parties. We comply with the Information Technology Act, 2000 and India's data protection regulations.

Security:
- All transactions are encrypted using SSL/TLS
- Payment data is handled by PCI-DSS compliant processors (Razorpay)
- We do not store full card numbers, UPI PINs, or bank account details on our servers
- Your account is protected by your password — use a strong, unique password

Data retention:
- Account data is retained as long as your account is active
- Order records are kept for 7 years for tax and accounting purposes (as per Indian law)
- You can request data deletion by contacting support — we'll process it within 30 days

Cookies: We use essential cookies for site functionality and analytics cookies to improve our services. You can manage cookie preferences in your browser settings.

For our full privacy policy, visit the Privacy Policy page on our website.`,
  },
];

async function main() {
  await prisma.storePolicy.deleteMany();

  for (const policy of policies) {
    await prisma.storePolicy.create({ data: policy });
  }

  console.log(`Seeded ${policies.length} store policies.`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
