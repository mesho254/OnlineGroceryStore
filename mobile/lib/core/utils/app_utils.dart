import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';

// 1. Pricing & KES Formatting Utilities (Matches client/src/utils/pricing.js)
class PricingUtils {
  static String formatKES(num? value) {
    final amount = (value ?? 0).toDouble();
    final parts = amount.toStringAsFixed(2).split('.');
    final intPart = parts[0].replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    );
    return '$intPart.${parts[1]}';
  }

  static int getDiscountPercent(Map<String, dynamic> product) {
    final d = (product['discount'] as num?)?.toInt() ?? 0;
    return d.clamp(0, 95);
  }

  static double getOriginalPrice(Map<String, dynamic> product) {
    return ((product['price'] as num?) ?? 0).toDouble();
  }

  static double getEffectivePrice(Map<String, dynamic> product) {
    final basePrice = getOriginalPrice(product);
    final discount = getDiscountPercent(product);
    if (discount > 0) {
      return double.parse((basePrice * (1 - discount / 100)).toStringAsFixed(2));
    }
    final discounted = (product['discounted_price'] as num?)?.toDouble();
    if (discounted != null && discounted > 0 && discounted < basePrice) {
      return discounted;
    }
    return basePrice;
  }

  static double getUnitSavings(Map<String, dynamic> product) {
    return math.max(0, getOriginalPrice(product) - getEffectivePrice(product));
  }
}

// 2. Shared 1-Second Flash Countdown Engine (Matches client/src/utils/flashCountdown.js)
class RemainingTime {
  final int totalSeconds;
  final int days;
  final String hrs;
  final String mins;
  final String secs;

  const RemainingTime({
    required this.totalSeconds,
    required this.days,
    required this.hrs,
    required this.mins,
    required this.secs,
  });

  String toCompactClock() =>
      '${days > 0 ? '${days}d ' : ''}$hrs:$mins:$secs';

  String toBannerClock() =>
      '${days > 0 ? '${days}d : ' : ''}${hrs}h : ${mins}m : ${secs}s';
}

class FlashCountdown {
  static final Stream<int> liveClockStream = Stream<int>.periodic(
    const Duration(seconds: 1),
    (_) => DateTime.now().millisecondsSinceEpoch,
  ).asBroadcastStream();

  static int getMidnightMs(int nowMs) {
    final now = DateTime.fromMillisecondsSinceEpoch(nowMs);
    final midnight = DateTime(now.year, now.month, now.day + 1);
    return midnight.millisecondsSinceEpoch;
  }

  static int getFlashSaleEndMs(Map<String, dynamic>? product, [int? nowMs]) {
    final currentMs = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final rawEnds = product?['flash_sale_ends_at'];
    if (rawEnds != null && rawEnds.toString().isNotEmpty) {
      final parsed = DateTime.tryParse(rawEnds.toString());
      if (parsed != null && parsed.millisecondsSinceEpoch > currentMs) {
        return parsed.millisecondsSinceEpoch;
      }
    }
    return getMidnightMs(currentMs);
  }

  static int getSoonestFlashSaleEndMs(
    List<Map<String, dynamic>> products, [
    int? nowMs,
  ]) {
    final currentMs = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    if (products.isEmpty) {
      return getFlashSaleEndMs(null, currentMs);
    }
    int? minEndMs;
    for (final prod in products) {
      final endMs = getFlashSaleEndMs(prod, currentMs);
      if (minEndMs == null || endMs < minEndMs) {
        minEndMs = endMs;
      }
    }
    return minEndMs ?? getFlashSaleEndMs(null, currentMs);
  }

  static RemainingTime formatRemainingTime(int targetMs, [int? nowMs]) {
    final currentMs = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final totalSeconds = math.max(0, ((targetMs - currentMs) / 1000).floor());
    final days = totalSeconds ~/ 86400;
    final hrs = (totalSeconds % 86400) ~/ 3600;
    final mins = (totalSeconds % 3600) ~/ 60;
    final secs = totalSeconds % 60;

    return RemainingTime(
      totalSeconds: totalSeconds,
      days: days,
      hrs: hrs.toString().padLeft(2, '0'),
      mins: mins.toString().padLeft(2, '0'),
      secs: secs.toString().padLeft(2, '0'),
    );
  }
}

// 3. Canonical Order & Shipment Status Metadata (Matches client/src/utils/orderStatuses.js)
class OrderStatusMeta {
  final String code;
  final String label;
  final String description;
  final Color bgColor;
  final Color textColor;
  final IconData icon;
  final int stepIndex; // 1..6 for main progression

  const OrderStatusMeta({
    required this.code,
    required this.label,
    required this.description,
    required this.bgColor,
    required this.textColor,
    required this.icon,
    required this.stepIndex,
  });

  static const List<String> allFilterStatuses = [
    'ALL',
    'CREATED',
    'PENDING_CONFIRMATION',
    'WAITING_TO_BE_SHIPPED',
    'SHIPPED',
    'AVAILABLE_FOR_PICKUP',
    'DELIVERED',
    'RETURN_IN_PROGRESS',
    'RETURNED',
    'REFUNDED',
    'FAILED_DELIVERY',
    'CANCELLED',
    'CANCELLED_PAYMENT_UNSUCCESSFUL',
  ];

  static const List<Map<String, String>> sixProgressSteps = [
    {'code': 'CREATED', 'label': 'Order Placed'},
    {'code': 'PENDING_CONFIRMATION', 'label': 'Pending Confirmation'},
    {'code': 'WAITING_TO_BE_SHIPPED', 'label': 'Waiting to be Shipped'},
    {'code': 'SHIPPED', 'label': 'Shipped'},
    {'code': 'AVAILABLE_FOR_PICKUP', 'label': 'Available for Pickup'},
    {'code': 'DELIVERED', 'label': 'Delivered'},
  ];

  static const List<String> sellerProposableStatuses = [
    'PENDING_CONFIRMATION',
    'WAITING_TO_BE_SHIPPED',
    'SHIPPED',
    'AVAILABLE_FOR_PICKUP',
    'DELIVERED',
    'RETURN_IN_PROGRESS',
    'RETURNED',
    'FAILED_DELIVERY',
    'CANCELLED',
  ];

  static OrderStatusMeta fromCode(String? rawCode) {
    final code = (rawCode ?? 'CREATED').toUpperCase().trim();
    switch (code) {
      case 'CREATED':
      case 'ORDER_PLACED':
        return const OrderStatusMeta(
          code: 'CREATED',
          label: 'Order Placed',
          description: 'We have received your order and locked your items.',
          bgColor: Color(0xFFE0F2FE),
          textColor: Color(0xFF0369A1),
          icon: Icons.receipt_long_rounded,
          stepIndex: 1,
        );
      case 'PENDING_CONFIRMATION':
        return const OrderStatusMeta(
          code: 'PENDING_CONFIRMATION',
          label: 'Pending Confirmation',
          description: 'Your payment is confirmed and dispatch is verifying items.',
          bgColor: Color(0xFFFEF3C7),
          textColor: Color(0xFFB45309),
          icon: Icons.verified_outlined,
          stepIndex: 2,
        );
      case 'WAITING_TO_BE_SHIPPED':
        return const OrderStatusMeta(
          code: 'WAITING_TO_BE_SHIPPED',
          label: 'Waiting to be Shipped',
          description: 'Your fresh groceries are packed and awaiting rider dispatch.',
          bgColor: Color(0xFFFEF3C7),
          textColor: Color(0xFFD97706),
          icon: Icons.inventory_2_outlined,
          stepIndex: 3,
        );
      case 'SHIPPED':
        return const OrderStatusMeta(
          code: 'SHIPPED',
          label: 'Shipped',
          description: 'Our express rider is on the way with your order.',
          bgColor: Color(0xFFDBEAFE),
          textColor: Color(0xFF1D4ED8),
          icon: Icons.delivery_dining_rounded,
          stepIndex: 4,
        );
      case 'AVAILABLE_FOR_PICKUP':
        return const OrderStatusMeta(
          code: 'AVAILABLE_FOR_PICKUP',
          label: 'Available for Pickup',
          description: 'Your order has arrived at your chosen KijaniMart Pickup Hub.',
          bgColor: Color(0xFFEDE9FE),
          textColor: Color(0xFF6D28D9),
          icon: Icons.storefront_rounded,
          stepIndex: 5,
        );
      case 'DELIVERED':
      case 'FULFILLED':
        return const OrderStatusMeta(
          code: 'DELIVERED',
          label: 'Delivered',
          description: 'Your order has been delivered. Enjoy your fresh groceries!',
          bgColor: Color(0xFFDCFCE7),
          textColor: Color(0xFF15803D),
          icon: Icons.check_circle_rounded,
          stepIndex: 6,
        );
      case 'RETURN_IN_PROGRESS':
        return const OrderStatusMeta(
          code: 'RETURN_IN_PROGRESS',
          label: 'Return in Progress',
          description: 'A return request is currently being processed.',
          bgColor: Color(0xFFFFEDD5),
          textColor: Color(0xFFC2410C),
          icon: Icons.assignment_return_outlined,
          stepIndex: 0,
        );
      case 'RETURNED':
        return const OrderStatusMeta(
          code: 'RETURNED',
          label: 'Returned',
          description: 'Order items have been returned to the fulfillment hub.',
          bgColor: Color(0xFFF1F5F9),
          textColor: Color(0xFF475569),
          icon: Icons.keyboard_return_rounded,
          stepIndex: 0,
        );
      case 'REFUNDED':
        return const OrderStatusMeta(
          code: 'REFUNDED',
          label: 'Refunded',
          description: 'Your payment has been refunded.',
          bgColor: Color(0xFFE0E7FF),
          textColor: Color(0xFF4338CA),
          icon: Icons.currency_exchange_rounded,
          stepIndex: 0,
        );
      case 'FAILED_DELIVERY':
        return const OrderStatusMeta(
          code: 'FAILED_DELIVERY',
          label: 'Failed Delivery',
          description: 'Delivery attempt could not be completed.',
          bgColor: Color(0xFFFEE2E2),
          textColor: Color(0xFFB91C1C),
          icon: Icons.error_outline_rounded,
          stepIndex: 0,
        );
      case 'CANCELLED_PAYMENT_UNSUCCESSFUL':
        return const OrderStatusMeta(
          code: 'CANCELLED_PAYMENT_UNSUCCESSFUL',
          label: 'Cancelled (Payment Unsuccessful)',
          description: 'Cancelled due to incomplete or unsuccessful payment.',
          bgColor: Color(0xFFFEE2E2),
          textColor: Color(0xFF991B1B),
          icon: Icons.cancel_outlined,
          stepIndex: 0,
        );
      case 'CANCELLED':
      default:
        return OrderStatusMeta(
          code: code,
          label: code == 'ALL' ? 'All' : 'Cancelled',
          description: 'This order was cancelled.',
          bgColor: const Color(0xFFFEE2E2),
          textColor: const Color(0xFFB91C1C),
          icon: Icons.cancel_outlined,
          stepIndex: 0,
        );
    }
  }
}
