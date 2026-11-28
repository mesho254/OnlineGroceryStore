import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../core/network/api_client.dart';
import '../../core/network/auth_session_manager.dart';
import '../../core/utils/app_utils.dart';

class KijaniColors {
  static const Color emerald = Color(0xFF059669);
  static const Color emeraldDark = Color(0xFF064E3B);
  static const Color emeraldLight = Color(0xFFECFDF5);
  static const Color emeraldBorder = Color(0xFFA7F3D0);
  static const Color slate900 = Color(0xFF0F172A);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color amber = Color(0xFFF59E0B);
  static const Color orangeCookie = Color(0xFFF68B1E);
  static const Color danger = Color(0xFFDC2626);
}

// 1. Image-Backed Category Aisle Cards (Matches Categories.js imagery)
class CategoryAisleStrip extends StatelessWidget {
  final String? selectedCategory;
  final ValueChanged<String?> onSelectCategory;

  const CategoryAisleStrip({
    super.key,
    required this.selectedCategory,
    required this.onSelectCategory,
  });

  static const List<Map<String, dynamic>> categories = [
    {
      'name': 'All',
      'short': 'All Aisles',
      'sub': '50+ Items',
      'image': 'assets/images/categories/all.png',
      'icon': Icons.storefront_rounded,
      'bg': Color(0xFFECFDF5),
      'border': Color(0xFF10B981),
    },
    {
      'name': 'Fruits and Vegetables',
      'short': 'Fruits & Veg',
      'sub': 'Farm Fresh',
      'image': 'assets/images/categories/fruits_vegetables.png',
      'icon': Icons.eco_rounded,
      'bg': Color(0xFFF0FDF4),
      'border': Color(0xFF86EFAC),
    },
    {
      'name': 'Meat Poultry and Seafood',
      'short': 'Meat & Seafood',
      'sub': 'Prime Cuts',
      'image': 'assets/images/categories/meat_poultry_seafood.png',
      'icon': Icons.set_meal_rounded,
      'bg': Color(0xFFFEF2F2),
      'border': Color(0xFFFECACA),
    },
    {
      'name': 'Dairy and Eggs',
      'short': 'Dairy & Eggs',
      'sub': 'Daily Fresh',
      'image': 'assets/images/categories/dairy_eggs.png',
      'icon': Icons.egg_alt_rounded,
      'bg': Color(0xFFEFF6FF),
      'border': Color(0xFFBFDBFE),
    },
    {
      'name': 'Breakfast',
      'short': 'Breakfast',
      'sub': 'Morning Staples',
      'image': 'assets/images/categories/breakfast.png',
      'icon': Icons.bakery_dining_rounded,
      'bg': Color(0xFFFEFCE8),
      'border': Color(0xFFFDE047),
    },
    {
      'name': 'Beverages',
      'short': 'Beverages',
      'sub': 'Juices & Coffee',
      'image': 'assets/images/categories/cold.png',
      'icon': Icons.local_cafe_rounded,
      'bg': Color(0xFFF0F9FF),
      'border': Color(0xFFBAE6FD),
    },
    {
      'name': 'Chocolate and Candy',
      'short': 'Chocolate',
      'sub': 'Sweet Treats',
      'image': 'assets/images/categories/chocolate_candy.png',
      'icon': Icons.cookie_rounded,
      'bg': Color(0xFFFDF4FF),
      'border': Color(0xFFF5D0FE),
    },
    {
      'name': 'Chips and Crackers',
      'short': 'Snacks',
      'sub': 'Crispy Snacks',
      'image': 'assets/images/categories/snacks.png',
      'icon': Icons.fastfood_rounded,
      'bg': Color(0xFFFFF7ED),
      'border': Color(0xFFFED7AA),
    },
    {
      'name': 'Ice Cream',
      'short': 'Ice Cream',
      'sub': 'Frozen Gelato',
      'image': 'assets/images/categories/icecream.png',
      'icon': Icons.icecream_rounded,
      'bg': Color(0xFFFDF2F8),
      'border': Color(0xFFFBCFE8),
    },
  ];

  @override
  Widget build(BuildContext context) {
    final active = selectedCategory ?? 'All';
    return SizedBox(
      height: 118,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, idx) {
          final cat = categories[idx];
          final name = cat['name'] as String;
          final isSelected = active.toLowerCase() == name.toLowerCase();
          return GestureDetector(
            onTap: () => onSelectCategory(name == 'All' ? null : name),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 92,
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected
                      ? KijaniColors.emerald
                      : KijaniColors.slate200,
                  width: isSelected ? 2 : 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: isSelected
                        ? KijaniColors.emerald.withValues(alpha: 0.18)
                        : KijaniColors.slate900.withValues(alpha: 0.04),
                    blurRadius: isSelected ? 12 : 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Container(
                    height: 58,
                    width: double.infinity,
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: cat['bg'] as Color,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Image.asset(
                      cat['image'] as String,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => Icon(
                        cat['icon'] as IconData,
                        color: KijaniColors.emerald,
                        size: 26,
                      ),
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    cat['short'] as String,
                    maxLines: 2,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      height: 1.15,
                      color: isSelected
                          ? KijaniColors.emeraldDark
                          : KijaniColors.slate900,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// 2. ProductCard with Live Per-Product Flash Countdown, Wishlist Heart & - 1 + Cart Stepper
class ProductCard extends StatelessWidget {
  final Map<String, dynamic> product;
  final bool showReason;
  final bool showFlashTimer;
  final VoidCallback onTap;
  final VoidCallback onToggleWishlist;
  final ValueChanged<int> onUpdateCartQty;

  const ProductCard({
    super.key,
    required this.product,
    required this.onTap,
    required this.onToggleWishlist,
    required this.onUpdateCartQty,
    this.showReason = false,
    this.showFlashTimer = false,
  });

  @override
  Widget build(BuildContext context) {
    final session = AuthSessionManager.instance;
    final productId = (product['product_id'] ?? '').toString();
    final name = (product['name'] ?? 'Fresh Grocery').toString();
    final category = (product['category'] ?? '').toString();
    final weight = '${product['weight'] ?? ''} ${product['measurement'] ?? ''}'.trim();
    final image = (product['image'] ?? '').toString();
    final stock = (product['stock'] as num?)?.toInt() ?? 0;
    final isFlash = product['flash_sale'] == true;
    final discountPct = PricingUtils.getDiscountPercent(product);
    final originalPrice = PricingUtils.getOriginalPrice(product);
    final effectivePrice = PricingUtils.getEffectivePrice(product);
    final rating = ((product['rating'] as num?) ?? 4.8).toStringAsFixed(1);
    final sellerName = (product['seller'] is Map
            ? product['seller']['name']
            : product['brand'])
        ?.toString() ??
        'KijaniMart Farm';
    final reason = product['recommendation_reason']?.toString();

    final isWishlisted =
        session.customerSession?.wishlist.contains(productId) ?? false;
    final qtyInCart = session.getProductQuantityInCart(productId);
    final hasActiveFlashTimer =
        showFlashTimer && (isFlash || discountPct > 0);

    return GestureDetector(
      onTap: () {
        ApiClient.instance.trackInteraction(
          eventType: 'CLICK',
          productId: productId,
          category: category,
        );
        onTap();
      },
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: KijaniColors.slate200),
          boxShadow: [
            BoxShadow(
              color: KijaniColors.slate900.withValues(alpha: 0.06),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Full-Bleed Covered Top Image Stage + Floating Badges & Wishlist Button
            SizedBox(
              height: 142,
              width: double.infinity,
              child: ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(19)),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(
                      color: const Color(0xFFF1F5F9),
                      child: image.isNotEmpty
                          ? Image.network(
                              image,
                              fit: BoxFit.cover,
                              width: double.infinity,
                              height: double.infinity,
                              errorBuilder: (_, __, ___) => const Center(
                                child: Icon(
                                  Icons.shopping_basket_outlined,
                                  size: 46,
                                  color: KijaniColors.emerald,
                                ),
                              ),
                            )
                          : const Center(
                              child: Icon(
                                Icons.shopping_basket_outlined,
                                size: 46,
                                color: KijaniColors.emerald,
                              ),
                            ),
                    ),
                    Positioned(
                      top: 8,
                      left: 8,
                      right: 8,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _buildTopBadge(stock, isFlash, discountPct),
                          InkWell(
                            onTap: onToggleWishlist,
                            borderRadius: BorderRadius.circular(999),
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.94),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color:
                                        Colors.black.withValues(alpha: 0.10),
                                    blurRadius: 6,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: Icon(
                                isWishlisted
                                    ? Icons.favorite_rounded
                                    : Icons.favorite_border_rounded,
                                size: 17,
                                color: isWishlisted
                                    ? const Color(0xFFE11D48)
                                    : KijaniColors.slate700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Card Content
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Category & Weight Row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            category.toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: KijaniColors.emerald,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ),
                        if (weight.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: KijaniColors.slate50,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              weight,
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: KijaniColors.slate700,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),

                    // Product Title
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: KijaniColors.slate900,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),

                    // Rating & Seller Row
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 5,
                            vertical: 1.5,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '★ $rating',
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFB45309),
                            ),
                          ),
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            sellerName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 10.5,
                              color: KijaniColors.slate500,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),

                    if (showReason && reason != null && reason.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 2.5,
                        ),
                        decoration: BoxDecoration(
                          color: KijaniColors.emeraldLight,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          '✨ $reason',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: KijaniColors.emeraldDark,
                          ),
                        ),
                      ),
                    ],

                    // Individual Per-Product Live Flash Countdown Strip
                    if (hasActiveFlashTimer) ...[
                      const SizedBox(height: 6),
                      StreamBuilder<int>(
                        stream: FlashCountdown.liveClockStream,
                        builder: (context, snapshot) {
                          final nowMs = snapshot.data ??
                              DateTime.now().millisecondsSinceEpoch;
                          final endMs =
                              FlashCountdown.getFlashSaleEndMs(product, nowMs);
                          final rem =
                              FlashCountdown.formatRemainingTime(endMs, nowMs);
                          return Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4.5,
                            ),
                            decoration: BoxDecoration(
                              color: KijaniColors.slate900,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Row(
                                    children: [
                                      const Icon(
                                        Icons.timer_outlined,
                                        size: 12,
                                        color: Color(0xFFFBBF24),
                                      ),
                                      const SizedBox(width: 4),
                                      Flexible(
                                        child: Text(
                                          isFlash ? 'Ends in' : 'Deal ends',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: Colors.white,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Text(
                                  rem.toCompactClock(),
                                  style: const TextStyle(
                                    fontSize: 10.5,
                                    fontFamily: 'monospace',
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFFFBBF24),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ],

                    const Spacer(),

                    // Price & Add / Stepper Footer
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (discountPct > 0)
                                Text(
                                  'KES ${PricingUtils.formatKES(originalPrice)}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    color: KijaniColors.slate500,
                                    decoration: TextDecoration.lineThrough,
                                  ),
                                )
                              else
                                const Text(
                                  'Price',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: KijaniColors.slate500,
                                  ),
                                ),
                              Text(
                                'KES ${PricingUtils.formatKES(effectivePrice)}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w900,
                                  color: KijaniColors.slate900,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 4),
                        if (stock <= 0)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: KijaniColors.slate200,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Text(
                              'Sold Out',
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: KijaniColors.slate500,
                              ),
                            ),
                          )
                        else if (qtyInCart > 0)
                          Container(
                            decoration: BoxDecoration(
                              color: KijaniColors.emeraldLight,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: KijaniColors.emeraldBorder,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                InkWell(
                                  onTap: () => onUpdateCartQty(qtyInCart - 1),
                                  child: const Padding(
                                    padding: EdgeInsets.all(5),
                                    child: Icon(
                                      Icons.remove,
                                      size: 14,
                                      color: KijaniColors.emeraldDark,
                                    ),
                                  ),
                                ),
                                Padding(
                                  padding:
                                      const EdgeInsets.symmetric(horizontal: 6),
                                  child: Text(
                                    '$qtyInCart',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                      color: KijaniColors.emeraldDark,
                                    ),
                                  ),
                                ),
                                InkWell(
                                  onTap: qtyInCart < stock
                                      ? () => onUpdateCartQty(qtyInCart + 1)
                                      : null,
                                  child: const Padding(
                                    padding: EdgeInsets.all(5),
                                    child: Icon(
                                      Icons.add,
                                      size: 14,
                                      color: KijaniColors.emeraldDark,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          )
                        else
                          InkWell(
                            onTap: () => onUpdateCartQty(1),
                            borderRadius: BorderRadius.circular(999),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 7,
                              ),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    Color(0xFF10B981),
                                    Color(0xFF059669),
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(999),
                                boxShadow: [
                                  BoxShadow(
                                    color: KijaniColors.emerald
                                        .withValues(alpha: 0.3),
                                    blurRadius: 8,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.add_rounded,
                                    size: 15,
                                    color: Colors.white,
                                  ),
                                  SizedBox(width: 3),
                                  Text(
                                    'Add',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBadge(int stock, bool isFlash, int discountPct) {
    String text;
    Color bg;
    Color fg;
    if (stock <= 0) {
      text = 'Sold Out';
      bg = const Color(0xFFFEE2E2);
      fg = const Color(0xFFB91C1C);
    } else if (isFlash) {
      text = '⚡ Flash ${discountPct > 0 ? '-$discountPct%' : 'Deal'}';
      bg = const Color(0xFFF59E0B);
      fg = Colors.white;
    } else if (discountPct > 0) {
      text = '-$discountPct% OFF';
      bg = const Color(0xFFFEE2E2);
      fg = const Color(0xFFDC2626);
    } else if (stock <= 10) {
      text = 'Only $stock left';
      bg = const Color(0xFFFEF3C7);
      fg = const Color(0xFFB45309);
    } else {
      text = '🌿 Farm Fresh';
      bg = KijaniColors.emeraldLight;
      fg = KijaniColors.emerald;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: fg,
        ),
      ),
    );
  }
}

// 3. Compact Icon Action Button with Tooltip (Matches IconActionButton.js)
class IconActionButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final Color color;
  final Color bgColor;
  final VoidCallback? onPressed;

  const IconActionButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.color = KijaniColors.slate700,
    this.bgColor = KijaniColors.slate50,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: color.withOpacity(0.25)),
          ),
          child: Icon(icon, size: 16, color: color),
        ),
      ),
    );
  }
}

// 4. Floating Bottom-Left Cookie Consent Popup (Matches CookieConsentPopup.js & Screenshot)
class CookieConsentBanner extends StatelessWidget {
  final VoidCallback onOpenPrivacyNotice;

  const CookieConsentBanner({
    super.key,
    required this.onOpenPrivacyNotice,
  });

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AuthSessionManager.instance,
      builder: (context, _) {
        if (AuthSessionManager.instance.hasCookieChoice) {
          return const SizedBox.shrink();
        }
        return Align(
          alignment: Alignment.bottomLeft,
          child: Padding(
            padding: const EdgeInsets.only(left: 14, right: 14, bottom: 14),
            child: Material(
              elevation: 12,
              borderRadius: BorderRadius.circular(8),
              color: Colors.white,
              child: Container(
                width: MediaQuery.of(context).size.width > 400
                    ? 350
                    : MediaQuery.of(context).size.width - 28,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: KijaniColors.slate200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'This website uses cookies',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: KijaniColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      children: [
                        const Text(
                          'This website uses cookies. For further information on how we use cookies you can read our ',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: KijaniColors.slate700,
                            height: 1.4,
                          ),
                        ),
                        GestureDetector(
                          onTap: onOpenPrivacyNotice,
                          child: const Text(
                            'Privacy and Cookie notice',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: Color(0xFF2563EB),
                              fontWeight: FontWeight.w700,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: KijaniColors.orangeCookie,
                          foregroundColor: Colors.white,
                          elevation: 2,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 10,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(5),
                          ),
                        ),
                        onPressed: () {
                          AuthSessionManager.instance.saveCookieConsent(
                            status: 'accepted',
                            personalization: true,
                            performance: true,
                          );
                        },
                        child: const Text(
                          'Accept cookies',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

// 5. KijaniMart Brand Logo Widget
class KijaniLogoBadge extends StatelessWidget {
  final double size;
  const KijaniLogoBadge({super.key, this.size = 36});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.26),
      child: SvgPicture.asset(
        'assets/icons/kijanimart-logo.svg',
        width: size,
        height: size,
      ),
    );
  }
}

// 6. Confirm Action Modal with Optional Reason Input (Matches ConfirmActionModal.js)
Future<String?> showConfirmActionModal(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  Color confirmColor = KijaniColors.danger,
  bool showReasonInput = false,
  String reasonHint = 'Provide an optional reason...',
  bool requireReason = false,
}) async {
  final reasonCtrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) {
      String? err;
      return StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            title,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: KijaniColors.slate900,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                message,
                style: const TextStyle(
                  fontSize: 13.5,
                  color: KijaniColors.slate700,
                  height: 1.45,
                ),
              ),
              if (showReasonInput) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: reasonCtrl,
                  maxLines: 2,
                  decoration: InputDecoration(
                    hintText: reasonHint,
                    errorText: err,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(null),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: confirmColor,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                final text = reasonCtrl.text.trim();
                if (requireReason && text.isEmpty) {
                  setState(() => err = 'Please enter a reason.');
                  return;
                }
                Navigator.of(ctx).pop(text);
              },
              child: Text(confirmLabel),
            ),
          ],
        ),
      );
    },
  );
}

// 7. Floating Center-Button Bottom Navigation Dock
// Frosted floating capsule with an elevated circular emerald Cart orb in the middle.
// Layout: [Tab 0] [Tab 1]  (( CART ORB = index 2 ))  [Tab 3] [Tab 4]
class KijaniDockItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;

  const KijaniDockItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
  });
}

class KijaniFloatingCenterDock extends StatelessWidget {
  /// Selected index (0-4). Index 2 is the floating center Cart orb.
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  /// Exactly 4 side items: [left1, left2, right1, right2].
  final List<KijaniDockItem> items;
  final int cartCount;
  final String centerLabel;

  const KijaniFloatingCenterDock({
    super.key,
    required this.selectedIndex,
    required this.onSelect,
    required this.items,
    this.cartCount = 0,
    this.centerLabel = 'Cart',
  }) : assert(items.length == 4);

  static const double _pillHeight = 66;
  static const double _orbSize = 64;
  static const double _orbRise = 20;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final centerActive = selectedIndex == 2;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 10 + bottomInset),
      child: SizedBox(
        height: _pillHeight + _orbRise,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.bottomCenter,
          children: [
            // Frosted floating capsule
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: _pillHeight,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(_pillHeight / 2),
                  boxShadow: [
                    BoxShadow(
                      color: KijaniColors.slate900.withValues(alpha: 0.12),
                      blurRadius: 28,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(_pillHeight / 2),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.96),
                        borderRadius: BorderRadius.circular(_pillHeight / 2),
                        border: Border.all(color: const Color(0xFFD1FAE5)),
                      ),
                      child: Material(
                        color: Colors.transparent,
                        child: Row(
                          children: [
                            Expanded(child: _buildTab(items[0], 0)),
                            Expanded(child: _buildTab(items[1], 1)),
                            SizedBox(
                              width: _orbSize + 14,
                              child: Align(
                                alignment: Alignment.bottomCenter,
                                child: Padding(
                                  padding: const EdgeInsets.only(bottom: 9),
                                  child: Text(
                                    centerLabel,
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: centerActive
                                          ? FontWeight.w900
                                          : FontWeight.w700,
                                      color: centerActive
                                          ? KijaniColors.emerald
                                          : KijaniColors.slate500,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            Expanded(child: _buildTab(items[2], 3)),
                            Expanded(child: _buildTab(items[3], 4)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),

            // Elevated floating center Cart orb
            Positioned(
              top: 0,
              child: GestureDetector(
                onTap: () => onSelect(2),
                child: AnimatedScale(
                  scale: centerActive ? 1.06 : 1.0,
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutBack,
                  child: Container(
                    width: _orbSize,
                    height: _orbSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          Color(0xFF10B981),
                          Color(0xFF059669),
                          Color(0xFF047857),
                        ],
                      ),
                      border: Border.all(
                        color: centerActive
                            ? const Color(0xFFFDE68A)
                            : Colors.white,
                        width: 4.5,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: KijaniColors.emerald.withValues(alpha: 0.42),
                          blurRadius: 18,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        const Center(
                          child: Icon(
                            Icons.shopping_bag_rounded,
                            color: Colors.white,
                            size: 27,
                          ),
                        ),
                        if (cartCount > 0)
                          Positioned(
                            top: -6,
                            right: -6,
                            child: Container(
                              constraints: const BoxConstraints(minWidth: 22),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF59E0B),
                                borderRadius: BorderRadius.circular(999),
                                border:
                                    Border.all(color: Colors.white, width: 2),
                              ),
                              child: Text(
                                cartCount > 99 ? '99+' : '$cartCount',
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTab(KijaniDockItem item, int index) {
    final active = selectedIndex == index;
    return InkWell(
      onTap: () => onSelect(index),
      borderRadius: BorderRadius.circular(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            padding: EdgeInsets.symmetric(
              horizontal: active ? 14 : 8,
              vertical: 5,
            ),
            decoration: BoxDecoration(
              color: active ? KijaniColors.emeraldLight : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Icon(
              active ? item.activeIcon : item.icon,
              size: 22,
              color: active ? KijaniColors.emerald : KijaniColors.slate500,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            item.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: active ? FontWeight.w900 : FontWeight.w600,
              color: active ? KijaniColors.emerald : KijaniColors.slate500,
            ),
          ),
        ],
      ),
    );
  }
}
