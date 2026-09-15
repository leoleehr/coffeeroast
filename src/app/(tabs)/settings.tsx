import Constants from 'expo-constants';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { BrandHeader } from '@/components/BrandHeader';
import { GoogleDriveSettings } from '@/components/GoogleDriveSettings';
import { SensorSettings } from '@/components/SensorSettings';
import { SetupNotice } from '@/components/SetupNotice';
import { AppText, Button, Card, Row, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { t } from '@/i18n/zh-TW';

export default function SettingsScreen() {
  const { session, signOut, configured } = useAuth();

  return (
    <Screen scroll>
      <SetupNotice />

      <Card>
        <AppText variant="label" color="textSecondary">
          {t.settings.account}
        </AppText>
        {configured && session ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText color="textSecondary">{t.auth.email}</AppText>
              <AppText>{session.user.email}</AppText>
            </Row>
            <Button label={t.auth.signOut} variant="secondary" onPress={signOut} style={{ marginTop: Spacing.two }} />
          </>
        ) : (
          <AppText color="textSecondary">{t.demo.banner}</AppText>
        )}
      </Card>

      {configured ? <GoogleDriveSettings /> : null}

      <AppText variant="label" color="textSecondary">
        {t.settings.sensor}
      </AppText>
      <SensorSettings />

      <Card>
        <AppText variant="label" color="textSecondary">
          {t.settings.about}
        </AppText>
        <BrandHeader />
        <Row style={{ justifyContent: 'space-between', marginTop: Spacing.one }}>
          <AppText>{t.settings.version}</AppText>
          <AppText>{Constants.expoConfig?.version ?? '—'}</AppText>
        </Row>
      </Card>
      <View />
    </Screen>
  );
}
