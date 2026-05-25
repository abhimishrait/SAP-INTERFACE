'use client';
import React from 'react';
import { TopBar } from '@/components';
import { TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakToggle, TweakButton, useTweaks } from '@/components/TweaksPanel';
import { MODULES } from '@/data';
import Login, { getAuth, setAuthLS, type AuthUser } from '@/views/Login';
import Sidebar from '@/views/Sidebar';
import Overview from '@/views/Overview';
import Modules from '@/views/Modules';
import FieldMapping from '@/views/FieldMapping';
import ApiLogs from '@/views/ApiLogs';
import SyncQueue from '@/views/SyncQueue';
import Database from '@/views/Database';
import Connections from '@/views/Connections';
import ApiTester from '@/views/ApiTester';

const TWEAKS_DEFAULTS = {
  view: 'overview',
  envFilter: 'staging',
  selectedTxId: 'txn_1763a-32a13-25c29',
  selectedModule: 'greater-circles',
  rightPaneTab: 'db',
  showFlowAnimation: true,
  density: 'comfortable',
  theme: 'light',
};

export default function App() {
  const [tw, setTweak] = useTweaks(TWEAKS_DEFAULTS);
  const [user, setUser] = React.useState<AuthUser | null>(() => getAuth());

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', tw.theme || 'dark');
  }, [tw.theme]);

  const setSelectedTxId = (id: string) => setTweak('selectedTxId', id);
  const setRightPaneTab = (tab: string) => setTweak('rightPaneTab', tab);
  const setView = (v: string) => setTweak('view', v);
  const setSelectedModule = (m: string | null) => setTweak('selectedModule', m ?? '');
  const setTheme = (t: string) => setTweak('theme', t);

  const onLogin = (u: AuthUser) => setUser(u);
  const onLogout = () => {
    if (!confirm('Sign out of the integration console?')) return;
    setAuthLS(null);
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={onLogin} />;
  }

  const env = tw.envFilter || 'staging';
  const shortEnv = env === 'production' ? 'prod' : env === 'staging' ? 'staging' : 'dev';
  const setEnv = (e: string) => setTweak('envFilter', e);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <Sidebar view={tw.view} setView={setView} user={user} onLogout={onLogout} env={shortEnv} setEnv={setEnv} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-0)' }}>
        <TopBar theme={tw.theme || 'dark'} setTheme={setTheme} env={shortEnv} />
        <div style={{ flex: 1, minHeight: 0 }}>
          {tw.view === 'overview'  && <Overview flowAnim={tw.showFlowAnimation} density={tw.density} />}
          {tw.view === 'modules'   && <Modules setSelectedModule={(id) => setTweak('selectedModule', id)} setView={setView} />}
          {tw.view === 'tester'    && <ApiTester selectedModule={tw.selectedModule} setSelectedModule={setSelectedModule} theme={tw.theme} />}
          {tw.view === 'mapping'   && <FieldMapping selectedModule={tw.selectedModule} setSelectedModule={(id) => setTweak('selectedModule', id)} density={tw.density} />}
          {tw.view === 'logs'      && (
            <ApiLogs
              density={tw.density}
              rightPaneTab={tw.rightPaneTab}
              setRightPaneTab={setRightPaneTab}
              selectedTxId={tw.selectedTxId}
              setSelectedTxId={setSelectedTxId}
            />
          )}
          {tw.view === 'queue'     && <SyncQueue />}
          {tw.view === 'database'  && <Database />}
          {tw.view === 'conns'     && <Connections />}
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance">
          <TweakRadio
            label="Theme"
            value={tw.theme || 'dark'}
            options={['dark', 'light']}
            onChange={(v) => setTweak('theme', v)}
          />
        </TweakSection>

        <TweakSection label="Navigation">
          <TweakSelect
            label="View"
            value={tw.view}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'modules',  label: 'Modules (16)' },
              { value: 'tester',   label: 'API Tester' },
              { value: 'mapping',  label: 'Field Mapping' },
              { value: 'logs',     label: 'API Logs' },
              { value: 'queue',    label: 'Sync Queue' },
              { value: 'database', label: 'Database' },
              { value: 'conns',    label: 'Connections' },
            ]}
            onChange={(v) => setTweak('view', v)}
          />
          <TweakSelect
            label="Module"
            value={tw.selectedModule}
            options={MODULES.map(m => ({ value: m.id, label: `${m.code} ${m.label}` }))}
            onChange={(v) => setTweak('selectedModule', v)}
          />
        </TweakSection>

        <TweakSection label="Pipeline">
          <TweakToggle
            label="Flow animation"
            value={tw.showFlowAnimation}
            onChange={(v) => setTweak('showFlowAnimation', v)}
          />
          <TweakRadio
            label="Environment"
            value={tw.envFilter}
            options={['production', 'staging', 'dev']}
            onChange={(v) => setTweak('envFilter', v)}
          />
        </TweakSection>

        <TweakSection label="Session">
          <TweakButton label="Sign out" onClick={onLogout} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
