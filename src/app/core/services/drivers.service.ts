import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Driver, DriverStatus } from '../models/driver.model';
import { Paginated, PageParams, toHttpParams } from '../models/pagination.model';

interface CreateDriverInput {
  name: string;
  email: string;
  phone?: string;
  vehicleType?: string;
  plateNumber?: string;
  licenseNumber?: string;
}

interface UpdateDriverInput {
  name?: string;
  phone?: string;
  vehicleType?: string;
  plateNumber?: string;
  licenseNumber?: string;
}

@Injectable({ providedIn: 'root' })
export class DriversService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/drivers`;

  list(params?: PageParams): Promise<Paginated<Driver>> {
    return firstValueFrom(this.http.get<Paginated<Driver>>(this.base, { params: toHttpParams(params) }));
  }

  create(input: CreateDriverInput): Promise<{ data: Driver; tempPassword: string }> {
    return firstValueFrom(this.http.post<{ data: Driver; tempPassword: string }>(this.base, input));
  }

  update(id: number, input: UpdateDriverInput): Promise<Driver> {
    return firstValueFrom(this.http.patch<{ data: Driver }>(`${this.base}/${id}`, input)).then((r) => r.data);
  }

  /** `suspensionDays` solo aplica con status='suspended': ausente/0 = suspensión indefinida. */
  updateStatus(id: number, status: DriverStatus, suspensionDays?: number): Promise<Driver> {
    return firstValueFrom(
      this.http.patch<{ data: Driver }>(`${this.base}/${id}/status`, { status, suspensionDays }),
    ).then((r) => r.data);
  }
}
