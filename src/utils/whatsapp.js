export const generateWhatsAppMessage = (service, plan, paymentMethod, settings, price) => {
  const whatsappNumber = settings.whatsappNumber || import.meta.env.VITE_WHATSAPP_NUMBER || '';
  const planText = plan ? `, plan ${plan.name}` : '';
  const paymentText = paymentMethod ? `, método de pago ${paymentMethod.name}` : '';
  const priceText = price ? `. Valor: ${price}` : '';

  const message = `Hola, quiero comprar el servicio ${service.name}${planText}${paymentText}${priceText}.`;

  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodedMessage}`;

  return url;
};

