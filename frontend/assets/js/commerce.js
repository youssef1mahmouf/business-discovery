(function () {
  if (!window.BD) return;

  BD.requireAuth();
  const authPayload = BD.getTokenPayload();
  if (!authPayload || !authPayload.sub) {
    location.href = 'login.html';
    return;
  }

  const sellerId = authPayload.sub;
  const page = location.pathname.split('/').pop();
  const formatMoney = (minor) => new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP'
  }).format((minor || 0) / 100);

  function setMessage(id, message, failed) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.style.color = failed ? 'var(--danger)' : 'var(--text-muted)';
  }

  function make(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function renderSummary(summary, host) {
    host.replaceChildren(
      make('p', 'الطلبات المؤكدة يدوياً: ' + summary.paidOrders),
      make('p', 'إجمالي المبيعات المؤكدة: ' + formatMoney(summary.grossMinor)),
      make('p', 'عمولة المنصة المقدرة — غير محصلة: ' + formatMoney(summary.estimatedFeeMinor))
    );
    if (summary.feeSettlement !== 'manual_not_collected') {
      host.appendChild(make('p', 'تعذر التحقق من حالة التسوية.', 'small'));
    }
  }

  async function loadSummary(hostId) {
    const host = document.getElementById(hostId);
    if (!host) return;
    try {
      const { summary } = await BD.api('/api/commerce/summary');
      renderSummary(summary, host);
    } catch (error) {
      host.textContent = error.message;
    }
  }

  async function loadSellerSettings() {
    try {
      const data = await BD.api('/api/commerce/settings');
      document.getElementById('instapayAddress').value = data.seller.instapayAddress || '';
      document.getElementById('paymentInstructions').value = data.seller.instructions || '';
      document.getElementById('acceptingOrders').value = String(data.seller.acceptingOrders === true);
      setMessage('sellerSettingsStatus', data.providers[0].enabled
        ? 'المزود اليدوي مفعّل؛ الدفع يتطلب تحققاً بشرياً.'
        : 'المزود متوقف من إدارة المنصة حالياً.', false);
    } catch (error) {
      setMessage('sellerSettingsStatus', error.message, true);
    }
  }

  async function loadProducts() {
    const productList = document.getElementById('productList');
    if (!productList) return;
    try {
      const data = await BD.api('/api/products');
      document.getElementById('productCount').textContent = String(data.products.length);
      productList.replaceChildren();
      if (!data.products.length) productList.appendChild(make('p', 'لا توجد منتجات بعد.'));
      data.products.forEach((product) => {
        const card = make('article', undefined, 'card');
        card.append(make('h3', product.name), make('p', product.description || 'لا يوجد وصف'));
        card.append(make('p', formatMoney(product.priceMinor) + ' · ' + (product.active ? 'منشور' : 'مسودة / متوقف')));
        if (product.importState) card.appendChild(make('p', 'مسودة مستوردة؛ راجعها قبل النشر.', 'small'));
        const actions = make('div', undefined, 'flex gap-8');
        const toggle = make('button', product.active ? 'إيقاف النشر' : 'نشر المنتج', 'btn btn-secondary btn-sm');
        toggle.type = 'button';
        toggle.addEventListener('click', async () => {
          toggle.disabled = true;
          try {
            await BD.api('/api/products/' + encodeURIComponent(product._id), {
              method: 'PUT',
              body: JSON.stringify({
                name: product.name,
                description: product.description,
                priceMinor: product.priceMinor,
                active: !product.active
              })
            });
            await loadProducts();
          } catch (error) {
            toggle.disabled = false;
            setMessage('productStatus', error.message, true);
          }
        });
        const edit = make('button', 'تعديل', 'btn btn-secondary btn-sm');
        edit.type = 'button';
        edit.addEventListener('click', () => renderEditForm(card, product));
        actions.append(toggle, edit);
        card.appendChild(actions);
        productList.appendChild(card);
      });
    } catch (error) {
      productList.textContent = error.message;
    }
  }

  function renderEditForm(card, product) {
    const form = document.createElement('form');
    form.className = 'profile-form-grid mt-16';
    const name = document.createElement('input');
    name.className = 'input';
    name.value = product.name;
    name.maxLength = 160;
    name.required = true;
    const price = document.createElement('input');
    price.className = 'input';
    price.type = 'number';
    price.min = '0.01';
    price.step = '0.01';
    price.value = String(product.priceMinor / 100);
    price.required = true;
    const description = document.createElement('textarea');
    description.className = 'input wide';
    description.value = product.description;
    description.maxLength = 2000;
    const activeLabel = document.createElement('label');
    activeLabel.className = 'assessment-option';
    const active = document.createElement('input');
    active.type = 'checkbox';
    active.checked = product.active;
    activeLabel.append(active, document.createTextNode('منشور'));
    const save = make('button', 'حفظ', 'btn btn-primary');
    save.type = 'submit';
    const cancel = make('button', 'إلغاء', 'btn btn-secondary');
    cancel.type = 'button';
    cancel.addEventListener('click', () => card.removeChild(form));
    form.append(name, price, description, activeLabel, save, cancel);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await BD.api('/api/products/' + encodeURIComponent(product._id), {
          method: 'PUT',
          body: JSON.stringify({
            name: name.value,
            description: description.value,
            priceMinor: Math.round(Number(price.value) * 100),
            active: active.checked
          })
        });
        await loadProducts();
      } catch (error) {
        setMessage('productStatus', error.message, true);
      }
    });
    card.appendChild(form);
  }

  async function loadOrders() {
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) return;
    try {
      const data = await BD.api('/api/orders');
      ordersList.replaceChildren();
      if (!data.orders.length) ordersList.appendChild(make('p', 'لا توجد طلبات بعد.'));
      data.orders.forEach((order) => {
        const card = make('article', undefined, 'card');
        const isSeller = order.sellerId === sellerId;
        const statusLabels = {
          awaiting_transfer: 'بانتظار التحويل',
          pending_verification: 'بانتظار التحقق اليدوي',
          paid: 'تم التحقق يدوياً',
          rejected: 'مرفوض'
        };
        card.append(
          make('h3', order.productName),
          make('p', 'الكمية: ' + order.quantity + ' · الإجمالي: ' + formatMoney(order.totalMinor)),
          make('p', 'الحالة: ' + (statusLabels[order.status] || order.status))
        );
        if (isSeller) card.appendChild(make('p', 'المشتري: ' + order.buyerEmail));
        if (order.transferReference) card.appendChild(make('p', 'مرجع التحويل: ' + order.transferReference));
        if (!isSeller && order.status !== 'paid' && order.paymentReceiver) {
          card.append(
            make('p', 'عنوان الاستلام: ' + order.paymentReceiver),
            make('p', order.paymentInstructions || 'تعليمات التحويل محفوظة مع الطلب.')
          );
        }
        if (isSeller && order.status === 'pending_verification') {
          const actions = make('div', undefined, 'flex gap-8');
          [['paid', 'تأكيد التحويل بعد المراجعة'], ['rejected', 'رفض التحويل']].forEach(([status, label]) => {
            const button = make('button', label, 'btn btn-secondary btn-sm');
            button.type = 'button';
            button.addEventListener('click', async () => {
              if (!window.confirm('هل راجعت التحويل في تطبيق البنك واخترت الإجراء الصحيح؟')) return;
              try {
                await BD.api('/api/orders/' + encodeURIComponent(order._id) + '/verify', {
                  method: 'PUT',
                  body: JSON.stringify({ status })
                });
                await loadOrders();
              } catch (error) {
                setMessage('ordersStatus', error.message, true);
              }
            });
            actions.appendChild(button);
          });
          card.appendChild(actions);
        }
        if (!isSeller && order.status === 'awaiting_transfer') {
          const form = document.createElement('form');
          form.className = 'profile-form-grid mt-16';
          const reference = document.createElement('input');
          reference.className = 'input';
          reference.placeholder = 'مرجع التحويل من التطبيق البنكي';
          reference.minLength = 4;
          reference.maxLength = 120;
          reference.required = true;
          const submit = make('button', 'إرسال المرجع للمراجعة', 'btn btn-primary');
          submit.type = 'submit';
          form.append(reference, submit);
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
              await BD.api('/api/orders/' + encodeURIComponent(order._id) + '/transfer-reference', {
                method: 'POST',
                body: JSON.stringify({ reference: reference.value })
              });
              await loadOrders();
            } catch (error) {
              setMessage('ordersStatus', error.message, true);
            }
          });
          card.appendChild(form);
        }
        ordersList.appendChild(card);
      });
    } catch (error) {
      ordersList.textContent = error.message;
    }
  }

  let importedDrafts = [];

  function renderImportDrafts(drafts) {
    const importPreview = document.getElementById('importPreview');
    importedDrafts = drafts;
    importPreview.replaceChildren();
    importedDrafts.forEach((draft, index) => {
      const row = make('div', undefined, 'profile-form-grid card');
      const name = document.createElement('input');
      name.className = 'input';
      name.maxLength = 160;
      name.value = draft.name;
      name.setAttribute('aria-label', 'اسم المنتج ' + (index + 1));
      const price = document.createElement('input');
      price.className = 'input';
      price.type = 'number';
      price.min = '0.01';
      price.step = '0.01';
      price.value = draft.priceMinor == null ? '' : String(draft.priceMinor / 100);
      price.setAttribute('aria-label', 'السعر بالجنيه ' + (index + 1));
      const description = document.createElement('textarea');
      description.className = 'input wide';
      description.value = draft.description || '';
      description.maxLength = 2000;
      description.setAttribute('aria-label', 'وصف المنتج ' + (index + 1));
      row.append(name, price, description);
      importPreview.appendChild(row);
      draft.inputs = { name, price, description };
    });
    importPreview.hidden = false;
    document.getElementById('commitImport').hidden = !drafts.length;
  }

  const sellerSettingsForm = document.getElementById('sellerSettingsForm');
  if (sellerSettingsForm) {
    loadSellerSettings();
    sellerSettingsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await BD.api('/api/commerce/settings', {
          method: 'PUT',
          body: JSON.stringify({
            instapayAddress: document.getElementById('instapayAddress').value,
            instructions: document.getElementById('paymentInstructions').value,
            acceptingOrders: document.getElementById('acceptingOrders').value === 'true'
          })
        });
        setMessage('sellerSettingsStatus', data.seller.acceptingOrders
          ? 'تم حفظ إعدادات المتجر.'
          : 'تم حفظ الإعدادات؛ استقبال الطلبات متوقف.', false);
      } catch (error) {
        setMessage('sellerSettingsStatus', error.message, true);
      }
    });

    document.getElementById('shopLink').value = new URL(
      'shop.html?sellerId=' + encodeURIComponent(sellerId),
      location.href
    ).href;
    document.getElementById('copyShopLink').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById('shopLink').value);
        setMessage('sellerSettingsStatus', 'تم نسخ رابط المتجر.', false);
      } catch (error) {
        setMessage('sellerSettingsStatus', 'انسخ الرابط يدوياً من الحقل.', true);
        console.error('Unable to access the clipboard:', error);
      }
    });
  }

  const productForm = document.getElementById('productForm');
  if (productForm) {
    loadProducts();
    productForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await BD.api('/api/products', {
          method: 'POST',
          body: JSON.stringify({
            name: document.getElementById('productName').value,
            description: document.getElementById('productDescription').value,
            priceMinor: Math.round(Number(document.getElementById('productPrice').value) * 100)
          })
        });
        productForm.reset();
        setMessage('productStatus', 'تمت إضافة المنتج.', false);
        await loadProducts();
      } catch (error) {
        setMessage('productStatus', error.message, true);
      }
    });
  }

  const productImportFile = document.getElementById('productImportFile');
  if (productImportFile) {
    productImportFile.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) {
        setMessage('importStatus', 'الحد الأقصى لحجم الملف 1 ميغابايت.', true);
        event.target.value = '';
        return;
      }
      try {
        const contentBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
          reader.onerror = () => reject(new Error('تعذر قراءة الملف محلياً.'));
          reader.readAsDataURL(file);
        });
        const data = await BD.api('/api/products/import-preview', {
          method: 'POST',
          body: JSON.stringify({ filename: file.name, contentBase64 })
        });
        renderImportDrafts(data.drafts);
        setMessage('importStatus', data.message, false);
      } catch (error) {
        document.getElementById('importPreview').hidden = true;
        document.getElementById('commitImport').hidden = true;
        setMessage('importStatus', error.message, true);
      } finally {
        event.target.value = '';
      }
    });

    document.getElementById('commitImport').addEventListener('click', async () => {
      const products = importedDrafts.map((draft) => ({
        name: draft.inputs.name.value,
        description: draft.inputs.description.value,
        priceMinor: Math.round(Number(draft.inputs.price.value) * 100)
      }));
      try {
        const result = await BD.api('/api/products/import-commit', {
          method: 'POST',
          body: JSON.stringify({ products })
        });
        setMessage('importStatus', 'حُفظت ' + result.imported + ' مسودة غير منشورة. راجعها قبل النشر.', false);
        importedDrafts = [];
        document.getElementById('importPreview').replaceChildren();
        document.getElementById('importPreview').hidden = true;
        document.getElementById('commitImport').hidden = true;
      } catch (error) {
        setMessage('importStatus', error.message, true);
      }
    });
  }

  if (document.getElementById('ordersList')) loadOrders();
  if (document.getElementById('commerceSummary')) loadSummary('commerceSummary');

  const adminPaymentForm = document.getElementById('adminPaymentForm');
  if (adminPaymentForm) {
    (async () => {
      try {
        const data = await BD.api('/api/admin/payment-settings');
        document.getElementById('providerEnabled').value = String(data.settings.instapayEnabled);
        document.getElementById('commissionRate').value = String(data.settings.commissionBps / 100);
      } catch (error) {
        setMessage('adminPaymentStatus', error.message, true);
        return;
      }
      try {
        const result = await BD.api('/api/admin/commerce/summary');
        renderSummary(result.summary, document.getElementById('adminCommerceSummary'));
      } catch (error) {
        document.getElementById('adminCommerceSummary').textContent = error.message;
      }
    })();

    adminPaymentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const settings = {
          instapayEnabled: document.getElementById('providerEnabled').value === 'true',
          commissionBps: Math.round(Number(document.getElementById('commissionRate').value) * 100)
        };
        await BD.api('/api/admin/payment-settings', {
          method: 'PUT',
          body: JSON.stringify(settings)
        });
        setMessage('adminPaymentStatus', 'تم حفظ إعدادات المنصة. تظل جميع التحويلات يدوية.', false);
      } catch (error) {
        setMessage('adminPaymentStatus', error.message, true);
      }
    });
  }

  const platformLink = document.querySelector('[data-platform-settings]');
  if (platformLink) {
    BD.api('/api/admin/payment-settings').then(() => {
      platformLink.hidden = false;
    }).catch((error) => {
      if (error.status !== 401 && error.status !== 403) {
        console.error('Unable to determine platform payment settings access:', error);
      }
    });
  }
})();
