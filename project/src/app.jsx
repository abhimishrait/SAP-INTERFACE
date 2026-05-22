// App shell — login gate + theme-aware

function App() {
  const [tw, setTweak] = useTweaks(window.TWEAKS);
  const [user, setUser] = React.useState(() => getAuth());

  // Apply theme to <html data-theme="…">
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', tw.theme || 'dark');
  }, [tw.theme]);

  const setSelectedTxId    = (id) => setTweak('selectedTxId', id);
  const setRightPaneTab    = (tab) => setTweak('rightPaneTab', tab);
  const setView            = (v) => setTweak('view', v);
  const setSelectedModule  = (m) => setTweak('selectedModule', m);
  const setTheme           = (t) => setTweak('theme', t);

  const onLogin = (u) => setUser(u);
  const onLogout = () => {
    if (!confirm('Sign out of the integration console?')) return;
    setAuthLS(null);
    setUser(null);
  };

  // Not authenticated → show login
  if (!user) {
    return <Login onLogin={onLogin} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <Sidebar view={tw.view} setView={setView} user={user} onLogout={onLogout} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-0)' }}>
        <TopBar theme={tw.theme || 'dark'} setTheme={setTheme} />
        <div style={{ flex: 1, minHeight: 0 }}>
          {tw.view === 'overview' && <Overview flowAnim={tw.showFlowAnimation} density={tw.density} />}
          {tw.view === 'modules'  && <Modules setSelectedModule={setSelectedModule} setView={setView} />}
          {tw.view === 'tester'   && <ApiTester selectedModule={tw.selectedModule} setSelectedModule={setSelectedModule} theme={tw.theme} />}
          {tw.view === 'mapping'  && <FieldMapping selectedModule={tw.selectedModule} setSelectedModule={setSelectedModule} density={tw.density} />}
          {tw.view === 'logs'     && <ApiLogs
                                       density={tw.density}
                                       rightPaneTab={tw.rightPaneTab}
                                       setRightPaneTab={setRightPaneTab}
                                       selectedTxId={tw.selectedTxId}
                                       setSelectedTxId={setSelectedTxId}
                                     />}
          {tw.view === 'queue'    && <SyncQueue />}
          {tw.view === 'database' && <Database />}
          {tw.view === 'conns'    && <Connections />}
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance">
          <TweakRadio
            label="Theme"
            value={tw.theme || 'dark'}
            options={['dark','light']}
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
            options={['production','staging','dev']}
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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
