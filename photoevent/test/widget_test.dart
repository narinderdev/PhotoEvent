import 'package:flutter_test/flutter_test.dart';

import 'package:photoevent/main.dart';

void main() {
  testWidgets('shows host and guest in one mobile app', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const MyApp());

    expect(find.text('One app for Host and Guest'), findsOneWidget);
    expect(find.text('Host'), findsWidgets);
    expect(find.text('Guest'), findsWidgets);
    expect(find.text('Gaurav Birthday'), findsOneWidget);
  });
}
