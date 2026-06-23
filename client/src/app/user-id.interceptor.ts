import { HttpInterceptorFn } from '@angular/common/http';

function getOrCreateUserId(): string {
  let id = localStorage.getItem('ttf-user-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('ttf-user-id', id);
  }
  return id;
}

export const userIdInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ headers: req.headers.set('X-User-ID', getOrCreateUserId()) }));
