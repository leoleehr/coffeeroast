import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { t } from '@/i18n/zh-TW';

export default function SignInScreen() {
  const { signIn, signUp, signInWithGoogle, configured } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password);
      } else {
        const { needsConfirm } = await signUp(email.trim(), password, displayName.trim() || email.split('@')[0]);
        if (needsConfirm) {
          setInfo(t.auth.checkEmail);
          setMode('in');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.auth.error);
    } finally {
      setBusy(false);
    }
  };

  const signInGoogle = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') setError(t.auth.googleCancelled);
      else setError(e instanceof Error ? e.message : t.errors.googleSignIn);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ flexGrow: 1, justifyContent: 'center', gap: Spacing.four, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: Spacing.half }}>
          <AppText variant="display" style={{ textAlign: 'center' }}>
            {t.appName}
          </AppText>
          <AppText variant="label" color="textSecondary" style={{ textAlign: 'center', letterSpacing: 0.5 }}>
            {t.appNameEn}
          </AppText>
        </View>
        <Card>
          <AppText variant="heading">{mode === 'in' ? t.auth.signInTitle : t.auth.signUpTitle}</AppText>
          {mode === 'up' && (
            <TextField
              label={t.auth.displayName}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="none"
            />
          )}
          <TextField
            label={t.auth.email}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label={t.auth.password}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <AppText variant="caption" color="danger">{error}</AppText> : null}
          {info ? <AppText variant="caption" color="success">{info}</AppText> : null}
          <Button
            label={mode === 'in' ? t.auth.signIn : t.auth.signUp}
            onPress={submit}
            loading={busy}
            style={{ marginTop: Spacing.one }}
          />
          <Button
            label={mode === 'in' ? t.auth.toSignUp : t.auth.toSignIn}
            variant="ghost"
            onPress={() => {
              setMode((m) => (m === 'in' ? 'up' : 'in'));
              setError(null);
            }}
          />
          {configured ? (
            <>
              <AppText variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
                {t.auth.orDivider}
              </AppText>
              <Button label={t.auth.signInWithGoogle} variant="secondary" onPress={signInGoogle} loading={busy} />
            </>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}
