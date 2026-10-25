// src/ui-pustaka.js — Satu-satunya berkas pemanggil API JS Bootstrap di proyek Timer Belajar[cite: 1]

function tampilkanModalPengaturan() {
  const modalEl = document.querySelector('#modalPengaturan');
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

function tutupModalPengaturan() {
  const modalEl = document.querySelector('#modalPengaturan');
  if (modalEl) {
    const instance = bootstrap.Modal.getInstance(modalEl);
    if (instance) instance.hide();
  }
}