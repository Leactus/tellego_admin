import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { EmailSettings, EmailTemplate, EmailTemplateContent } from '../models/email-template.model';

/**
 * Correos transaccionales (Resend): el texto y el arte de cada plantilla y la
 * marca común (logo, pie). El texto por defecto vive en el backend; acá solo
 * se guarda lo que se personaliza.
 */
@Injectable({ providedIn: 'root' })
export class EmailTemplatesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/email-templates`;
  private readonly settingsBase = `${environment.apiUrl}/admin/email-settings`;

  /** `sendingEnabled` = el servidor tiene RESEND_API_KEY (si no, los correos solo quedan en el log). */
  list(): Promise<{ templates: EmailTemplate[]; sendingEnabled: boolean }> {
    return firstValueFrom(
      this.http.get<{ data: EmailTemplate[]; sendingEnabled: boolean }>(this.base),
    ).then((r) => ({ templates: r.data, sendingEnabled: r.sendingEnabled }));
  }

  update(key: string, payload: Partial<EmailTemplateContent> & { isEnabled?: boolean }): Promise<EmailTemplate> {
    return firstValueFrom(this.http.put<{ data: EmailTemplate }>(`${this.base}/${key}`, payload)).then((r) => r.data);
  }

  reset(key: string): Promise<EmailTemplate> {
    return firstValueFrom(this.http.post<{ data: EmailTemplate }>(`${this.base}/${key}/reset`, {})).then((r) => r.data);
  }

  /** Vista previa del borrador SIN guardarlo, con datos de ejemplo. */
  preview(key: string, draft: Partial<EmailTemplateContent>, dark: boolean): Promise<{ subject: string; html: string }> {
    return firstValueFrom(
      this.http.post<{ data: { subject: string; html: string } }>(`${this.base}/${key}/preview`, { ...draft, dark }),
    ).then((r) => r.data);
  }

  /** Envía la versión GUARDADA al correo del admin con sesión iniciada. */
  /** `to` vacío = al correo del admin que lo pide. */
  sendTest(key: string, to?: string): Promise<string> {
    return firstValueFrom(this.http.post<{ message: string }>(`${this.base}/${key}/test`, to ? { to } : {})).then(
      (r) => r.message,
    );
  }

  uploadBanner(key: string, file: File): Promise<EmailTemplate> {
    const formData = new FormData();
    formData.append('image', file);
    return firstValueFrom(this.http.post<{ data: EmailTemplate }>(`${this.base}/${key}/banner`, formData)).then(
      (r) => r.data,
    );
  }

  removeBanner(key: string): Promise<EmailTemplate> {
    return firstValueFrom(this.http.delete<{ data: EmailTemplate }>(`${this.base}/${key}/banner`)).then((r) => r.data);
  }

  getSettings(): Promise<EmailSettings> {
    return firstValueFrom(this.http.get<{ data: EmailSettings }>(this.settingsBase)).then((r) => r.data);
  }

  updateSettings(payload: { footerText?: string; supportEmail?: string }): Promise<EmailSettings> {
    return firstValueFrom(this.http.patch<{ data: EmailSettings }>(this.settingsBase, payload)).then((r) => r.data);
  }

  uploadLogo(file: File): Promise<EmailSettings> {
    const formData = new FormData();
    formData.append('image', file);
    return firstValueFrom(this.http.post<{ data: EmailSettings }>(`${this.settingsBase}/logo`, formData)).then(
      (r) => r.data,
    );
  }

  removeLogo(): Promise<EmailSettings> {
    return firstValueFrom(this.http.delete<{ data: EmailSettings }>(`${this.settingsBase}/logo`)).then((r) => r.data);
  }
}
