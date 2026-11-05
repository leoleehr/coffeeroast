import { View } from 'react-native';

import { AppText } from '@/components/ui/kit';
import { t } from '@/i18n/zh-TW';

/** Chinese + English brand lockup — "畫素微量烘焙咖啡 / Pixel Cafe' Nano-Roastery". */
export function BrandHeader() {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="title">{t.appName}</AppText>
      <AppText variant="label" color="textSecondary" style={{ letterSpacing: 0.5 }}>
        {t.appNameEn}
      </AppText>
    </View>
  );
}
