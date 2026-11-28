import 'package:flutter/material.dart';
import '../../core/network/auth_session_manager.dart';
import '../../shared/widgets/shared_widgets.dart';

/// Interactive Privacy and Cookie Notice Screen (Matches client/src/pages/privacy/PrivacyNotice.js)
class PrivacyNoticeScreen extends StatefulWidget {
  final VoidCallback? onBackToShop;

  const PrivacyNoticeScreen({super.key, this.onBackToShop});

  @override
  State<PrivacyNoticeScreen> createState() => _PrivacyNoticeScreenState();
}

class _PrivacyNoticeScreenState extends State<PrivacyNoticeScreen> {
  late bool _personalization;
  late bool _performance;
  String _toast = '';

  static const List<Map<String, String>> cookieInventory = [
    {
      'name': 'freshmart_cookie_consent',
      'storage': 'HTTP Cookie & SharedPreferences',
      'category': 'Strictly Necessary',
      'duration': '1 Year (365 Days)',
      'purpose':
          'Stores your cookie consent decision and category preferences so we do not ask you on every visit.',
    },
    {
      'name': 'profile (accessToken & refreshToken)',
      'storage': 'Secure / Local Storage',
      'category': 'Strictly Necessary & Security',
      'duration': 'Access: 15 Mins • Refresh: 7 Days',
      'purpose':
          'Authenticates your customer or admin session with automatic short-lived JWT rotation and session expiry protection.',
    },
    {
      'name': 'seller_profile',
      'storage': 'Isolated Seller Storage',
      'category': 'Strictly Necessary & Security',
      'duration': 'Access: 15 Mins • Refresh: 7 Days',
      'purpose':
          'Keeps your standalone KijaniMart Seller Center login separate from your customer storefront account.',
    },
    {
      'name': 'cart_<userId>',
      'storage': 'Local Storage & MongoDB Sync',
      'category': 'Strictly Necessary',
      'duration': 'Persistent per account',
      'purpose':
          'Keeps your user-scoped grocery basket synchronized across devices and prevents cart leakage between accounts.',
    },
    {
      'name': 'freshmart_session_id',
      'storage': 'Local Storage (X-Session-Id)',
      'category': 'Personalization & Recommendations',
      'duration': '60 Days rolling',
      'purpose':
          'Powers personalized homepage shelves ("Picked Just For You") and "Related Products" based on items you view or search.',
    },
    {
      'name': 'freshmart_rq_cache_v1',
      'storage': 'SWR Local Snapshot Cache',
      'category': 'Performance & Speed',
      'duration': '24 Hours (2-Min Stale Window)',
      'purpose':
          'Caches storefront catalog snapshots locally so pages and product details render in 0ms while revalidating in the background.',
    },
  ];

  @override
  void initState() {
    super.initState();
    final session = AuthSessionManager.instance;
    _personalization = session.isPersonalizationAllowed;
    _performance = session.isPerformanceCacheAllowed;
  }

  void _showFeedback(String msg) {
    setState(() => _toast = msg);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toast = '');
    });
  }

  @override
  Widget build(BuildContext context) {
    final consent = AuthSessionManager.instance.cookieConsent;
    final status = consent?['status']?.toString();

    return ListView(
      padding: const EdgeInsets.only(bottom: 40),
      children: [
        // Hero Banner
        Container(
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [
                KijaniColors.emeraldDark,
                KijaniColors.emerald,
                Color(0xFF10B981),
              ],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  '🔒 DATA PROTECTION & COOKIE TRANSPARENCY',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.7,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Privacy and Cookie Notice',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Learn how KijaniMart Online Grocery Store collects, protects, and uses cookies and personal data to deliver farm-fresh groceries across Nairobi in 20 minutes—in compliance with the Kenya Data Protection Act (2019) and GDPR standards.',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
              if (widget.onBackToShop != null) ...[
                const SizedBox(height: 12),
                TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: widget.onBackToShop,
                  icon: const Icon(Icons.arrow_back_rounded, size: 16),
                  label: const Text('Return to Shopping'),
                ),
              ],
            ],
          ),
        ),

        // Preference Center Card
        Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: KijaniColors.slate200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Expanded(
                      child: Text(
                        'LIVE PREFERENCE CENTER',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: KijaniColors.emerald,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: status == 'accepted'
                            ? const Color(0xFFDCFCE7)
                            : status == 'essential_only'
                                ? const Color(0xFFE0F2FE)
                                : const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        status == 'accepted'
                            ? '✓ Cookies Accepted'
                            : status == 'essential_only'
                                ? '🔒 Essential Cookies Only'
                                : '⏳ Awaiting Consent Choice',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: status == 'accepted'
                              ? const Color(0xFF166534)
                              : status == 'essential_only'
                                  ? const Color(0xFF075985)
                                  : const Color(0xFF92400E),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'Manage Your Cookie & Storage Preferences',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.slate900,
                  ),
                ),
                if (_toast.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: KijaniColors.emeraldLight,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _toast,
                      style: const TextStyle(
                        color: KijaniColors.emeraldDark,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 12),

                // 1. Essential
                _buildPrefTile(
                  title: '1. Strictly Necessary & Authentication Cookies',
                  desc:
                      'Required for account sign-in (15m access tokens & 7d rotating refresh tokens), user-scoped shopping cart, checkout stock lock, and security.',
                  trailing: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: KijaniColors.emeraldLight,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'Always Active',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: KijaniColors.emerald,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),

                // 2. Personalization
                _buildPrefTile(
                  title: '2. Personalization & Smart Recommendations',
                  desc:
                      'Allows KijaniMart to remember products you view, search, and wishlist so we can curate relevant shelves ("Picked Just For You").',
                  trailing: Switch(
                    activeColor: KijaniColors.emerald,
                    value: _personalization,
                    onChanged: (v) => setState(() => _personalization = v),
                  ),
                ),
                const SizedBox(height: 10),

                // 3. Performance
                _buildPrefTile(
                  title: '3. Performance & Instant Catalog Caching',
                  desc:
                      'Caches non-sensitive product catalog and flash-sale snapshots on your device so screens open in 0ms without repetitive loading spinners.',
                  trailing: Switch(
                    activeColor: KijaniColors.emerald,
                    value: _performance,
                    onChanged: (v) => setState(() => _performance = v),
                  ),
                ),
                const SizedBox(height: 16),

                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: KijaniColors.orangeCookie,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: () async {
                        setState(() {
                          _personalization = true;
                          _performance = true;
                        });
                        await AuthSessionManager.instance.saveCookieConsent(
                          status: 'accepted',
                          personalization: true,
                          performance: true,
                        );
                        _showFeedback(
                          '✓ All cookie preferences accepted and saved.',
                        );
                      },
                      child: const Text('Accept All Cookies'),
                    ),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: KijaniColors.emerald,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: () async {
                        final st = (_personalization || _performance)
                            ? 'accepted'
                            : 'essential_only';
                        await AuthSessionManager.instance.saveCookieConsent(
                          status: st,
                          personalization: _personalization,
                          performance: _performance,
                        );
                        _showFeedback(
                          '✓ Your custom cookie preferences have been saved.',
                        );
                      },
                      child: const Text('Save My Preferences'),
                    ),
                    OutlinedButton(
                      onPressed: () async {
                        setState(() {
                          _personalization = false;
                          _performance = false;
                        });
                        await AuthSessionManager.instance.saveCookieConsent(
                          status: 'essential_only',
                          personalization: false,
                          performance: false,
                        );
                        _showFeedback(
                          '✓ Saved: Strictly necessary cookies only.',
                        );
                      },
                      child: const Text('Essential Cookies Only'),
                    ),
                    TextButton(
                      onPressed: () async {
                        await AuthSessionManager.instance.resetCookieConsent();
                        _showFeedback('Cookie popup re-opened at the bottom.');
                      },
                      child: const Text('Re-open Cookie Popup'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),

        // Cookie Inventory List
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: KijaniColors.slate200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'COOKIE & STORAGE INVENTORY',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: KijaniColors.emerald,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'What Cookies & Storage Keys KijaniMart Uses',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.slate900,
                  ),
                ),
                const SizedBox(height: 12),
                ...cookieInventory.map(
                  (row) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: KijaniColors.slate50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: KijaniColors.slate200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                row['name']!,
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w800,
                                  color: KijaniColors.slate900,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: KijaniColors.emeraldLight,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                row['category']!,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: KijaniColors.emeraldDark,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${row['storage']} • ${row['duration']}',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: KijaniColors.slate500,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          row['purpose']!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: KijaniColors.slate700,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPrefTile({
    required String title,
    required String desc,
    required Widget trailing,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: KijaniColors.slate50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: KijaniColors.slate200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: KijaniColors.slate900,
                  ),
                ),
              ),
              trailing,
            ],
          ),
          const SizedBox(height: 4),
          Text(
            desc,
            style: const TextStyle(
              fontSize: 12,
              color: KijaniColors.slate700,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}
