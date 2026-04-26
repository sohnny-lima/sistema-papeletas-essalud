// src/app/pipes/filter.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';



@Pipe({
  name: 'filter',
  standalone: true // Declarar el pipe como independiente
})
export class FilterPipe implements PipeTransform {
  transform(items: any[], searchTerm: string): any[] {
    if (!items || !searchTerm) {
      return items;
    }
    searchTerm = searchTerm.toLowerCase();
    return items.filter(item => {
      return Object.values(item).some(value =>
        (value as any).toString().toLowerCase().includes(searchTerm)
      );
    });
  }
}
