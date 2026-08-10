import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../core/models/pagination.model';

/** Paginador genérico (anterior/siguiente + tamaño de página) para listas del panel. */
@Component({
  selector: 'app-pager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pager.html',
  styleUrl: './pager.scss',
})
export class Pager {
  @Input() page = 1;
  @Input() totalPages = 1;
  @Input() total = 0;
  @Input() pageSize = DEFAULT_PAGE_SIZE;
  @Input() pageSizeOptions: readonly number[] = PAGE_SIZE_OPTIONS;
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  goPrev(): void {
    if (this.page > 1) this.pageChange.emit(this.page - 1);
  }

  goNext(): void {
    if (this.page < this.totalPages) this.pageChange.emit(this.page + 1);
  }

  onPageSizeChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (value && value !== this.pageSize) this.pageSizeChange.emit(value);
  }
}
