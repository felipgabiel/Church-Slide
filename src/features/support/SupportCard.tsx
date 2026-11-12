import { useState } from 'react';
import { LuCheck, LuCopy, LuHeart } from 'react-icons/lu';
import { readSetting, writeSetting } from '../../core/settings';
import { PIX_CODE, PIX_NAME, PIX_QR, SUPPORT_SNOOZE_DAYS } from '../../core/support';
import { Button } from '../../ui/Button';
import { tr } from '../../core/i18n';

const SNOOZE_KEY = 'support-snooze-until';

/** O convite pode aparecer agora? (some por algumas semanas depois de "Agora não") */
export const supportDue = (): boolean => Date.now() >= readSetting<number>(SNOOZE_KEY, 0);

export function PixQr({ size = PIX_QR.size * 3 }: { size?: number }) {
  return (
    <svg className="pix-qr" width={size} height={size} viewBox={`0 0 ${PIX_QR.size} ${PIX_QR.size}`} shapeRendering="crispEdges" role="img" aria-label={tr('QR Code do Pix para apoiar o projeto')}>
      <rect width={PIX_QR.size} height={PIX_QR.size} fill="#fff" />
      <path d={PIX_QR.path} fill="#000" />
    </svg>
  );
}

/**
 * Convite OPCIONAL para apoiar o projeto via Pix. Nunca bloqueia nada e nunca vai para dentro do vídeo.
 * `onDismiss`: "Agora não" (o convite some por {SUPPORT_SNOOZE_DAYS} dias nos downloads).
 */
export function SupportCard({ onDismiss }: { onDismiss?: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PIX_CODE);
    } catch {
      // sem permissão de área de transferência: seleciona o texto para Ctrl+C
      const ta = document.createElement('textarea');
      ta.value = PIX_CODE;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };
  return (
    <section className="support" aria-labelledby="support-title">
      <PixQr />
      <div className="support-body">
        <h3 id="support-title">
          <LuHeart aria-hidden />{' '}{tr('Gostou? Ajude a manter o Church Slide gratuito')}
        </h3>
        <p>
          {tr('É opcional: seus vídeos já estão prontos. O Church Slide é feito por um voluntário e qualquer valor ajuda a continuar melhorando. Aponte a câmera do app do banco para o QR Code ou copie o código Pix.')}
        </p>
        <p className="support-to">{tr('Pix para')}{' '}{PIX_NAME}</p>
        <div className="support-actions">
          <Button size="sm" variant="primary" icon={copied ? <LuCheck /> : <LuCopy />} onClick={() => void copy()}>
            {copied ? tr('Código copiado') : tr('Copiar código Pix')}
          </Button>
          {onDismiss && (
            <button
              type="button"
              className="link"
              onClick={() => {
                writeSetting(SNOOZE_KEY, Date.now() + SUPPORT_SNOOZE_DAYS * 86400000);
                onDismiss();
              }}
            >
              {tr('Agora não')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
