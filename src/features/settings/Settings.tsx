import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LuClapperboard, LuDownload, LuGlobe, LuHardDrive, LuMonitorPlay, LuPenLine, LuSettings, LuUpload } from 'react-icons/lu';
import { LAST_BACKUP_SETTING } from '../../core/storage/backup';
import { downloadBackup, restoreFromFile } from './backupActions';
import { LANG, LANGS, setLang, tr, type Lang } from '../../core/i18n';
import { DEFAULT_SETTINGS, type ExportSettings } from '../../core/export/exportSong';
import type { FitMode } from '../../core/present/channel';
import { useSetting } from '../../core/settings';
import { SNAP_SETTING } from '../../core/snap';
import { requestPersistence } from '../../core/storage/db';
import { formatBytes } from '../../core/util';
import { Button, IconButton } from '../../ui/Button';
import { Row, Segmented, Slider, Switch } from '../../ui/Controls';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/toast';
import { ShortcutsEditor } from '../present/ShortcutsEditor';

type Section = 'general' | 'editor' | 'present' | 'video' | 'storage';
type ThemeChoice = 'light' | 'dark' | 'system';
type VideoPrefs = Omit<ExportSettings, 'slideIds'>;

/** Engrenagem: abre as configurações. Fica na biblioteca, no editor, no Estúdio e no operador. */
export function SettingsButton({ initial = 'general' }: { initial?: Section }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label={tr('Configurações')} icon={<LuSettings />} onClick={() => setOpen(true)} />
      <SettingsDialog open={open} onClose={() => setOpen(false)} initial={initial} />
    </>
  );
}

export function SettingsDialog({ open, onClose, initial = 'general' }: { open: boolean; onClose: () => void; initial?: Section }) {
  const [section, setSection] = useState<Section>(initial);
  useEffect(() => {
    if (open) setSection(initial);
  }, [open, initial]);
  const nav: { id: Section; label: string; icon: ReactNode }[] = [
    { id: 'general', label: tr('Geral'), icon: <LuGlobe /> },
    { id: 'editor', label: tr('Editor'), icon: <LuPenLine /> },
    { id: 'present', label: tr('Apresentação'), icon: <LuMonitorPlay /> },
    { id: 'video', label: tr('Vídeos'), icon: <LuClapperboard /> },
    { id: 'storage', label: tr('Backup e armazenamento'), icon: <LuHardDrive /> },
  ];
  return (
    <Modal open={open} onClose={onClose} title={tr('Configurações')} width={720} className="setx" footer={<Button onClick={onClose}>{tr('Fechar')}</Button>}>
      <div className="setx-grid">
        <nav className="setx-nav" role="tablist" aria-label={tr('Seções das configurações')} aria-orientation="vertical">
          {nav.map((n) => (
            <button key={n.id} type="button" role="tab" aria-selected={section === n.id} data-on={section === n.id ? '1' : undefined} onClick={() => setSection(n.id)}>
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
        <div className="setx-body set" role="tabpanel">
          {section === 'general' && <General />}
          {section === 'editor' && <EditorPrefs />}
          {section === 'present' && <PresentPrefs />}
          {section === 'video' && <VideoPrefsPane />}
          {section === 'storage' && <StorageInfo />}
        </div>
      </div>
    </Modal>
  );
}

function General() {
  const [theme, setTheme] = useSetting<'light' | 'dark' | null>('theme', null);
  const choice: ThemeChoice = theme === 'light' || theme === 'dark' ? theme : 'system';
  return (
    <>
      <h3>{tr('Idioma')}</h3>
      <Row label={tr('Idioma do site')} hint={tr('A página recarrega para trocar')}>
        <Segmented<Lang> size="sm" label={tr('Idioma do site')} value={LANG} onChange={(v) => v !== LANG && setLang(v)} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} />
      </Row>
      <h3>{tr('Aparência')}</h3>
      <Row label={tr('Tema da interface')} hint={tr('O telão é sempre escuro')}>
        <Segmented<ThemeChoice>
          size="sm"
          label={tr('Tema da interface')}
          value={choice}
          onChange={(v) => setTheme(v === 'system' ? null : v)}
          options={[
            { value: 'light', label: tr('Claro') },
            { value: 'dark', label: tr('Escuro') },
            { value: 'system', label: tr('Automático'), title: tr('Segue o tema do sistema operacional') },
          ]}
        />
      </Row>
    </>
  );
}

function EditorPrefs() {
  const [snap, setSnap] = useSetting<boolean>(SNAP_SETTING, true);
  const [guides, setGuides] = useSetting<boolean>('guides', false);
  const [left, setLeft] = useSetting<boolean>('panel-left', true);
  const [right, setRight] = useSetting<boolean>('panel-right', true);
  return (
    <>
      <h3>{tr('Palco')}</h3>
      <Row label={tr('Ímã')} hint={tr('O texto gruda nas bordas, na margem segura e no centro ao arrastar')}>
        <Switch checked={snap} onChange={setSnap} label={tr('Ímã')} />
      </Row>
      <Row label={tr('Mostrar guias na pré-visualização')} hint={tr('Centro e área segura de 5%')}>
        <Switch checked={guides} onChange={setGuides} label={tr('Mostrar guias')} />
      </Row>
      <h3>{tr('Painéis')}</h3>
      <Row label={tr('Painel esquerdo')} hint={tr('Trechos, fundos, animações e elementos')}>
        <Switch checked={left} onChange={setLeft} label={tr('Painel esquerdo')} />
      </Row>
      <Row label={tr('Painel direito')} hint={tr('Texto, palavras, fundo e animação')}>
        <Switch checked={right} onChange={setRight} label={tr('Painel direito')} />
      </Row>
      <p className="field-hint setx-tip">{tr('Zoom do palco: Ctrl + roda do mouse. Para andar pela tela, segure Espaço e arraste com o botão esquerdo ou direito.')}</p>
    </>
  );
}

function PresentPrefs() {
  const [fit, setFit] = useSetting<FitMode>('fit', 'fill');
  const [auto, setAuto] = useSetting<boolean>('auto-advance', false);
  return (
    <>
      <h3>{tr('Telão')}</h3>
      <Row label={tr('Quando a tela não for 16:9')} hint={tr('Preencher não corta nada: o texto se adapta à tela')}>
        <Segmented<FitMode>
          size="sm"
          label={tr('Ajuste da imagem no telão')}
          value={fit}
          onChange={setFit}
          options={[
            { value: 'fill', label: tr('Preencher') },
            { value: 'letterbox', label: tr('Barras pretas') },
          ]}
        />
      </Row>
      <Row label={tr('Avanço automático')} hint={tr('Avança sozinho nos trechos que têm duração definida no editor')}>
        <Switch checked={auto} onChange={setAuto} label={tr('Avanço automático')} />
      </Row>
      <h3>{tr('Atalhos da apresentação')}</h3>
      <p className="field-hint">{tr('Clique em + para trocar ou adicionar uma tecla.')}</p>
      <ShortcutsEditor />
    </>
  );
}

function VideoPrefsPane() {
  const [saved, setSaved] = useSetting<VideoPrefs>('export', DEFAULT_SETTINGS);
  const prefs: VideoPrefs = { ...DEFAULT_SETTINGS, ...saved };
  const set = (patch: Partial<VideoPrefs>) => setSaved({ ...prefs, ...patch });
  return (
    <>
      <h3>{tr('Padrão dos vídeos por trecho')}</h3>
      <p className="field-hint">{tr('Usado ao abrir “Exportar vídeos”. Dá para mudar lá também, a cada exportação.')}</p>
      <Row label={tr('Resolução')}>
        <Segmented<string> size="sm" label={tr('Resolução')} value={String(prefs.height)} onChange={(v) => set({ height: Number(v) })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '2160', label: '4K' }]} />
      </Row>
      <Row label={tr('Quadros por segundo')}>
        <Segmented<string> size="sm" label={tr('Quadros por segundo')} value={String(prefs.fps)} onChange={(v) => set({ fps: Number(v) as 30 | 60 })} options={[{ value: '30', label: '30' }, { value: '60', label: '60' }]} />
      </Row>
      <Row label={tr('Qualidade')}>
        <Segmented<VideoPrefs['quality']>
          size="sm"
          label={tr('Qualidade')}
          value={prefs.quality}
          onChange={(v) => set({ quality: v })}
          options={[
            { value: 'low', label: tr('Leve') },
            { value: 'medium', label: tr('Média') },
            { value: 'high', label: tr('Alta') },
          ]}
        />
      </Row>
      <Slider label={tr('Tempo com a letra parada')} value={prefs.holdSec} min={1} max={30} step={0.5} unit=" s" reset={5} onChange={(v) => set({ holdSec: v })} />
    </>
  );
}

/** Backup de tudo num .zip (louvores, modelos, lixeira, fundos, mídia, fontes e preferências) e restauração. */
function BackupPane() {
  const [last] = useSetting<number | null>(LAST_BACKUP_SETTING, null);
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null);
  const [pct, setPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const progress = (f: number) => setPct(Math.round(f * 100));
  return (
    <>
      <h3>{tr('Cópia de segurança')}</h3>
      <p className="field-hint">
        {tr('Um arquivo .zip com tudo: louvores, modelos, lixeira, Meus fundos, imagens, vídeos, fontes e preferências. Guarde num pendrive ou na nuvem, e use para levar tudo a outro computador.')}
      </p>
      <Row label={tr('Último backup')} hint={last ? new Date(last).toLocaleString(LANG) : tr('Nenhum backup feito neste computador')}>
        <Button
          size="sm"
          variant="primary"
          icon={<LuDownload />}
          disabled={!!busy}
          onClick={async () => {
            setBusy('save');
            setPct(0);
            await downloadBackup(progress);
            setBusy(null);
          }}
        >
          {busy === 'save' ? tr('Preparando… {0}%', pct) : tr('Baixar backup de tudo')}
        </Button>
      </Row>
      <Row label={tr('Restaurar de um backup')} hint={tr('Junta com o que já existe aqui; nada é apagado')}>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          data-testid="restore-input"
          onChange={async (e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!f) return;
            setBusy('restore');
            setPct(0);
            await restoreFromFile(f, progress);
            setBusy(null);
          }}
        />
        <Button size="sm" icon={<LuUpload />} disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === 'restore' ? tr('Restaurando… {0}%', pct) : tr('Escolher arquivo…')}
        </Button>
      </Row>
    </>
  );
}

function StorageInfo() {
  const [info, setInfo] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const load = async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      setInfo({ usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted });
    } catch {
      setInfo(null);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <BackupPane />
      <h3>{tr('Armazenamento')}</h3>
      <p className="field-hint">{tr('Tudo fica guardado neste navegador, neste computador. Use “Exportar arquivo” num louvor para levar a outro computador.')}</p>
      {!info ? (
        <p className="field-hint">{tr('Informação de armazenamento indisponível neste navegador.')}</p>
      ) : (
        <>
          <Row label={tr('Espaço usado')} hint={tr('Projetos, imagens, vídeos e fontes')}>
            <span className="set-val">
              {formatBytes(info.usage)}
              {info.quota ? tr(' de {0}', formatBytes(info.quota)) : ''}
            </span>
          </Row>
          <Row label={tr('Proteção contra limpeza')} hint={tr('O navegador não apaga os dados sozinho quando faltar espaço')}>
            {info.persisted ? (
              <span className="chip" data-tone="ok">
                {tr('Ativa')}
              </span>
            ) : (
              <Button
                size="sm"
                onClick={async () => {
                  const ok = await requestPersistence();
                  toast(ok ? tr('Armazenamento protegido') : tr('O navegador não concedeu a proteção agora. Tente novamente mais tarde.'), ok ? 'ok' : 'info');
                  void load();
                }}
              >
                {tr('Ativar')}
              </Button>
            )}
          </Row>
        </>
      )}
    </>
  );
}
