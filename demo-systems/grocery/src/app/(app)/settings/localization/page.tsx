import { getT } from "@/shared/i18n";
import { getSystemSettings } from "@/features/settings/service";
import {
  AppearanceSettingsForm, LocalizationSettingsForm,
} from "@/features/settings/ui/settings-forms";

export default async function LocalizationSettingsPage() {
  const { t } = await getT();
  const data = await getSystemSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.settingsPage.title}</h1>
      <AppearanceSettingsForm
        t={t}
        data={{
          themePreset: data.themePreset,
          themePrimary: data.themePrimary,
          themePrimaryDark: data.themePrimaryDark,
          themeBackground: data.themeBackground,
          themeBackgroundDark: data.themeBackgroundDark,
          themeFont: data.themeFont,
          themeRadius: data.themeRadius,
        }}
      />
      <LocalizationSettingsForm
        t={t}
        data={{ dateFormat: data.dateFormat, timezone: data.timezone }}
      />
    </div>
  );
}
