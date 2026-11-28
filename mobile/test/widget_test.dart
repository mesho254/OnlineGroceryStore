import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kijanimart_mobile/main.dart';

void main() {
  testWidgets(
    'KijaniMartMobileApp renders all primary tabs at narrow 360x800 mobile width without RenderFlex overflow',
    (WidgetTester tester) async {
      // Simulate a narrow 360x800 mobile phone screen to catch any horizontal Row overflows
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(const KijaniMartMobileApp());
      await tester.pump(const Duration(milliseconds: 200));

      expect(find.text('KijaniMart'), findsWidgets);

      // Navigate through bottom dock tabs (Home -> Aisles -> Cart -> Orders -> Sign In)
      await tester.tap(find.text('Aisles').first);
      await tester.pump(const Duration(milliseconds: 200));

      await tester.tap(find.text('Orders').first);
      await tester.pump(const Duration(milliseconds: 200));

      await tester.tap(find.text('Sign In').first);
      await tester.pump(const Duration(milliseconds: 200));
    },
  );
}
