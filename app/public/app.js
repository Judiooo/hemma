(() => {
  "use strict";

  const state = {
    items: [],
    categories: [],
    settings: {},
    sortMode: "custom",
    searchQuery: "",
    weather: { loading: false, error: null, data: null, location: null },
    ping: { loading: false, data: [] },
    // Last network-speed measurement: { download, upload, latency, server } in
    // bits per second and milliseconds, straight from POST /api/speedtest.
    speed: { loading: false, error: null, data: null },
    dashboardIcons: { loading: false, catalog: null, results: [] },
    siteIcon: { applied: "", checked: "" },
    // Monitoring window (v32): which item and which period are on screen. The
    // period is a way of looking at the data, not a preference, so it lives here
    // rather than in settings and starts over at 1d on every reload.
    monitor: { itemId: null, range: "1d", data: null, error: null, loading: false, timer: null, requestId: 0 },
    backgroundHistory: [],
  };

  const TILE_PALETTE = [
    "#2C7BE5", "#1AAE6F", "#0E7C7B", "#F2994A", "#E6484B",
    "#8854D0", "#EA4C89", "#20B2AA", "#5A67D8", "#D9A441",
  ];

  const SEARCH_ENGINES = {
    google: { label: "Google", url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    yandex: { label: "Яндекс", url: q => `https://yandex.ru/search/?text=${encodeURIComponent(q)}` },
    bing: { label: "Bing", url: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    duckduckgo: { label: "DuckDuckGo", url: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
    brave: { label: "Brave", url: q => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  };
  const FONT_OPTIONS = {
    system: ['Системный','-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'],
    inter: ['Inter','Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'],
    roboto: ['Roboto','Roboto, Arial, sans-serif'],
    open_sans: ['Open Sans','"Open Sans", Arial, sans-serif'],
    lato: ['Lato','Lato, Arial, sans-serif'],
    montserrat: ['Montserrat','Montserrat, Arial, sans-serif'],
    poppins: ['Poppins','Poppins, Arial, sans-serif'],
    nunito: ['Nunito','Nunito, Arial, sans-serif'],
    raleway: ['Raleway','Raleway, Arial, sans-serif'],
    source_sans: ['Source Sans 3','"Source Sans 3", Arial, sans-serif'],
    fira_sans: ['Fira Sans','"Fira Sans", Arial, sans-serif'],
    ubuntu: ['Ubuntu','Ubuntu, Arial, sans-serif'],
    merriweather: ['Merriweather','Merriweather, Georgia, serif'],
    serif: ['Serif','Georgia, "Times New Roman", serif'],
    mono: ['Monospace','SFMono-Regular, Consolas, monospace'],
  };
  function tileColor(item) {
    const str = item.name || String(item.id);
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return TILE_PALETTE[Math.abs(hash) % TILE_PALETTE.length];
  }

  const el = (id) => document.getElementById(id);

  const DEFAULT_SEARCH_WIDTH = 480;

  // ---------- i18n ----------
  // The interface ships in Russian (default) and English. Static markup carries
  // data-i18n / data-i18n-ph / data-i18n-title / data-i18n-aria attributes and is
  // translated in place; every string built in JS goes through t().
  const LOCALES = { ru: "ru-RU", en: "en-US" };

  const I18N = {
    ru: {
      "common.cancel": "Отмена",
      "common.save": "Сохранить",
      "common.delete": "Удалить",
      "common.add": "Добавить",
      "common.close": "Закрыть",
      "common.done": "Готово",
      "common.export": "Экспорт",
      "common.import": "Импорт",

      "search.clear": "Очистить",
      "search.engine": "Поисковик",
      "search.engineAria": "Поисковик: {label}",
      "engine.yandex": "Яндекс",
      "font.system": "Системный",

      "toolbar.add": "Новый элемент",
      "toolbar.theme": "Тема",
      "toolbar.wallpaper": "Фон",
      "toolbar.settings": "Настройки",

      "empty.state": "Пока ничего нет. Нажмите «Новый элемент», чтобы добавить сервис или закладку.",

      "item.modal.new": "Новый элемент",
      "item.modal.edit": "Редактировать элемент",
      "item.name": "Название",
      "item.name.ph": "Например, Nextcloud",
      "item.url": "URL",
      "item.icon": "Иконка",
      "item.icon.fromSite": "Взять с сайта",
      "item.autoPick": "Подобрать по названию",
      "item.iconSearch.ph": "Например: nextcloud, proxmox, jellyfin",
      "item.iconFormat": "Формат иконки",
      "item.find": "Найти",
      "item.category": "Категория",
      "item.favorite": "Избранное",
      "item.display": "Способ отображения",
      "display.grid": "Основная сетка",
      "display.favorite": "Избранное",
      "display.block": "Блок категории",
      "item.iconBgMode": "Фон иконки",
      "item.iconBgColor": "Цвет фона",
      "iconBg.inherit": "Как в настройках",
      "iconBg.on": "Включён",
      "iconBg.off": "Выключен",
      "item.healthCheck": "Проверять доступность",
      "item.healthCheckType": "Метод проверки",
      "check.http": "HTTP/HTTPS",
      "check.tcp": "TCP",
      "check.icmp": "ICMP",
      "format.svg": "Векторный формат",
      "format.webp": "Растровый WebP",
      "format.png": "Растровый PNG",

      "hint.iconSource": "Иконки берутся из Dashboard Icons через CDN.",
      "hint.widgetRest": "Остальные параметры — по правому клику на виджете.",
      "hint.displayBlock": "Элемент показывается только в блоке своей категории, построчно.",
      "hint.displayBlockNone": "У элемента нет категории — он попадёт в общий блок «Без категории».",
      "hint.iconBgInheritOn": "Сейчас в настройках карточек фон иконок включён.",
      "hint.iconBgInheritOff": "Сейчас в настройках карточек фон иконок выключен.",
      "hint.checkTcp": "Проверяется TCP-подключение к хосту и порту из URL (по умолчанию 80/443).",
      "hint.checkIcmp": "Проверяется ICMP-эхо до хоста из URL. Порт и путь не учитываются.",
      "block.renameHint": "Название блока — это название категории; его можно изменить прямо здесь.",

      "confirm.deleteItem": "Удалить элемент?",
      "confirm.deleteItemNamed": "Удалить «{name}»?",
      "confirm.deleteCategory": "Удалить категорию «{name}»? Элементы останутся, но потеряют категорию.",
      "confirm.external": "Открыть внешнюю ссылку?\n{url}",
      "confirm.import": "Импорт заменит текущие сервисы, закладки и категории. Продолжить?",
      "confirm.resetAppearance": "Сбросить настройки внешнего вида до значений по умолчанию?",
      "confirm.resetCards": "Сбросить настройки карточек до значений по умолчанию?",

      "settings.title": "Настройки",
      "settings.appearance": "Оформление",
      "settings.theme": "Тема",
      "settings.font": "Шрифт",
      "settings.language": "Язык",
      "settings.background": "Фон",
      "settings.bgFile": "Файл с ПК",
      "settings.bgReset": "Сбросить фон",
      "settings.cards": "Карточки",
      "settings.cardSize": "Размер",
      "settings.columns": "Колонки",
      "settings.sort": "Сортировка",
      "settings.cardsAreaWidth": "Ширина области",
      "settings.cardIconBackground": "Фон иконок",
      "settings.iconBg": "Цвет фона иконки",
      "settings.opacity": "Прозрачность",
      "settings.opacityBlocks": "Блоки",
      "settings.opacityWidgets": "Виджеты",
      "settings.opacitySearch": "Строка поиска",
      "settings.opacityButtons": "Кнопки",
      "settings.categories": "Категории",
      "settings.blockSize": "Размер блоков",
      "settings.newCategory.ph": "Новая категория",
      "settings.widgets": "Виджеты",
      "settings.search": "Поиск",
      "settings.searchEngine": "Поисковик",
      "settings.width": "Ширина",
      "settings.height": "Высота",
      "settings.engineSwitcher": "Переключатель поисковика",
      "settings.engineSwitcherShort": "Переключатель",
      "settings.links": "Ссылки",
      "settings.openIn": "Открывать",
      "settings.confirmExternal": "Подтверждать внешние",
      "settings.data": "Данные",
      "settings.backup": "Резервная копия",
      "settings.resetDefaults": "Сброс до значений по умолчанию",
      "settings.resetAppearance": "Внешний вид",
      "settings.resetCards": "Карточки",

      "theme.light": "Светлая",
      "theme.dark": "Тёмная",
      "theme.light.alt": "Светлая тема",
      "theme.dark.alt": "Тёмная тема",
      "size.small": "Маленький",
      "size.medium": "Средний",
      "size.large": "Большой",
      "columns.auto": "Авто",
      "sort.custom": "Пользовательский порядок",
      "sort.name": "По названию",
      "sort.category": "По категории",
      "link.currentTab": "В текущей вкладке",
      "link.newTab": "В новой вкладке",
      // The switch in Настройки → Ссылки has a select's worth of room, so the
      // state next to it is named in the short form.
      "link.currentTabShort": "В текущей",
      "link.newTabShort": "В новой",

      "menu.edit": "Редактировать",
      "menu.favoriteToggle": "Избранное вкл/выкл",
      "menu.recheck": "Проверить доступность",
      "menu.monitoring": "Мониторинг",

      "status.online": "Online",
      "status.offline": "Offline",
      "status.checking": "Проверка...",
      "status.unknown": "Неизвестно",

      "monitor.period": "Период",
      "monitor.range.1h": "1 час",
      "monitor.range.6h": "6 часов",
      "monitor.range.1d": "1 день",
      "monitor.range.7d": "7 дней",
      "monitor.range.30d": "30 дней",
      "monitor.recheck": "Проверить сейчас",
      "monitor.checking": "Проверяем…",
      "monitor.loading": "Загружаем историю…",
      "monitor.uptime": "Доступность",
      "monitor.current": "Сейчас",
      "monitor.latency": "Задержка",
      "monitor.latencyRange": "мин {min} · макс {max}",
      "monitor.outages": "Сбоев",
      "monitor.downtime": "Простой",
      "monitor.longest": "Самый долгий {duration}",
      "monitor.lastCheck": "Последняя проверка",
      "monitor.samplesCount": "проверок: {count}",
      "monitor.availability": "Доступность по времени",
      "monitor.latencyChart": "Задержка по времени",
      "monitor.incidents": "Сбои",
      "monitor.incidentsMore": "показаны последние {shown} из {total}",
      "monitor.noIncidents": "За этот период сбоев не было.",
      "monitor.ongoing": "идёт сейчас",
      "monitor.noData": "нет данных",
      "monitor.empty": "За этот период проверок не было.",
      "monitor.checksOff": "Проверки доступности выключены в настройках — история не пополняется.",
      "monitor.itemChecksOff": "Для этого элемента проверка доступности отключена.",
      "monitor.retention": "История проверок хранится {days} дней.",
      "monitor.interval": "шаг {seconds} с",
      "monitor.error": "Не удалось загрузить историю: {message}",
      "monitor.segTip": "{time} · доступность {uptime}% ({samples})",
      "monitor.segNoData": "{time} · нет данных",
      "monitor.reason.timeout": "Таймаут",
      "monitor.reason.unreachable": "Недоступен",
      "monitor.reason.invalid_url": "Некорректный URL",
      "monitor.reason.invalid_host": "Некорректный хост",
      "monitor.reason.http": "Ответ HTTP {status}",

      "widget.date": "Дата",
      "widget.time": "Время",
      "widget.weather": "Погода",
      "widget.ping": "Пинг",
      "widget.sticky": "Sticky Note",
      "sticky.expand": "Развернуть Sticky Note",
      "sticky.collapse": "Свернуть",
      "sticky.bold": "Жирный",
      "sticky.italic": "Курсив",
      "sticky.underline": "Подчёркнутый",
      "sticky.asTodo": "Пункт с галочкой",
      "sticky.asBullet": "Список",
      "sticky.asText": "Обычный текст",
      "sticky.addLine": "+ Пункт",
      "sticky.removeLine": "Удалить строку",
      "sticky.placeholder": "Что нужно сделать?",
      "widget.speed": "Скорость сети",
      "speed.expand": "Скорость сети",
      "speed.collapse": "Свернуть",
      "speed.server": "Сервер",
      "speed.auto": "Авто (ближайший)",
      "speed.hint": "Измеряется каналом сервера HemmaHub",
      "speed.run": "Проверить",
      "speed.running": "Замер…",
      "speed.download": "Загрузка",
      "speed.upload": "Отдача",
      "speed.latency": "Задержка",
      "speed.idle": "Замер не выполнялся",
      "speed.doneVia": "Готово · {server}",
      "speed.noUpload": "Готово · {server} · отдача не измеряется этим сервером",
      "speed.failed": "Не удалось выполнить замер",
      "widget.settingsTitle": "{title} — настройки",
      "widget.format": "Формат",
      "widget.style": "Стиль",
      "widget.fontSize": "Размер шрифта",
      "widget.showSeconds": "Показывать секунды",
      "widget.place": "Место",
      "widget.city": "Город",
      "widget.city.ph": "Москва",
      "widget.units": "Единицы",
      "date.full": "Полный",
      "date.short": "Короткий",
      "date.numeric": "Числовой",
      "style.card": "Карточка",
      "style.minimal": "Минималистичный",
      "style.glass": "Стекло",
      "place.auto": "Определять автоматически",
      "place.city": "Указать город",

      "weather.clear": "Ясно",
      "weather.mostlyClear": "Преимущественно ясно",
      "weather.partlyCloudy": "Переменная облачность",
      "weather.overcast": "Пасмурно",
      "weather.fog": "Туман",
      "weather.rime": "Изморозь",
      "weather.drizzle": "Морось",
      "weather.rainLight": "Небольшой дождь",
      "weather.rain": "Дождь",
      "weather.rainHeavy": "Сильный дождь",
      "weather.snowLight": "Небольшой снег",
      "weather.snow": "Снег",
      "weather.snowHeavy": "Сильный снег",
      "weather.showers": "Ливни",
      "weather.showersHeavy": "Сильные ливни",
      "weather.thunder": "Гроза",
      "weather.thunderHail": "Гроза с градом",
      "weather.default": "Погода",
      "weather.loading": "Загрузка",
      "weather.myLocation": "Ваше местоположение",
      "weather.errCity": "Укажите город в настройках погоды",
      "weather.errGeocode": "Не удалось определить город",
      "weather.errNotFound": "Город не найден",
      "weather.errNoGeo": "Браузер не поддерживает геолокацию",
      "weather.errLocation": "Не удалось получить местоположение",
      "weather.errFetch": "Не удалось получить погоду",
      "weather.errGeneric": "Ошибка загрузки погоды",

      "units.kmh": "км/ч",
      "units.ms": "мс",
      "units.mbps": "Мбит/с",
      // Compact duration units — the monitoring window stacks up to two of them
      // ("3 д 4 ч"), so they have to stay short.
      "units.secShort": "с",
      "units.minShort": "мин",
      "units.hourShort": "ч",
      "units.dayShort": "д",

      "ping.format.full": "Имя + IP + пинг",
      "ping.format.name": "Имя + пинг",
      "ping.format.latency": "Только пинг",
      "ping.interval": "Регулярность (сек)",
      "ping.method": "Метод проверки",
      "ping.hint": "До 4 адресов. Для TCP-метода можно указать порт через двоеточие, например 192.168.1.10:445.",
      "ping.hostName.ph": "Имя ресурса",
      "ping.empty": "Укажите IP в настройках (ПКМ на виджете → Редактировать)",
      "ping.checking": "Проверка…",
      "ping.err": "Ошибка",

      "category.none": "Без категории",
      "category.empty": "Категорий пока нет",

      "icons.loadingCatalog": "Загружаем каталог Dashboard Icons…",
      "icons.catalogUnavailable": "Каталог временно недоступен. Можно использовать URL иконки вручную.",
      "icons.catalogError": "Не удалось загрузить каталог Dashboard Icons",
      "icons.found": "Найдено в {format}: {count}. Нажмите на иконку, чтобы выбрать её.",
      "icons.notFound": "В формате {format} ничего не найдено.",
      "icons.missingInFormat": "«{name}» в формате {format} отсутствует — выбранная иконка не изменена.",
      "icons.switched": "Выбранная иконка переключена на {format}.",
      "icons.source": "Иконки берутся из Dashboard Icons через CDN. Формат: {format}.",
      "icons.selected": "Выбрана иконка: {name} ({format})",

      "site.needUrl": "Сначала укажите URL сайта.",
      "site.checking": "Проверяем иконку сайта…",
      "site.noIcon": "Сайт не отдаёт файл иконки — выберите иконку вручную.",
      "site.icon": "Иконка сайта: {url}",
      "site.err": "Не удалось проверить иконку сайта: {message}",

      "bg.default": "Фон по умолчанию.",
      "bg.builtin": "Выбран встроенный фон.",
      "bg.uploaded": "Выбран загруженный фон.",
      "bg.link": "Выбран фон по ссылке.",
      "bg.color": "Выбрана заливка цветом.",
      "bg.wallpaper": "Обои",
      "bg.custom": "Мой фон {n}",

      "wallpaper.title": "Фон",
      "wallpaper.gallery": "Галерея",
      "wallpaper.upload": "Загрузить с ПК",
      "wallpaper.palette": "Цвет фона",
      "wallpaper.paletteHint": "Заливка вместо обоев.",
      "wallpaper.customColor": "Свой цвет",
      "wallpaper.rotation": "Автоматическая смена",
      "wallpaper.rotationOn": "Менять обои автоматически",
      "wallpaper.interval": "Интервал",
      "wallpaper.unit": "Единица",
      "wallpaper.selectAll": "Выбрать все",
      "wallpaper.clearAll": "Снять все",
      "wallpaper.inRotation": "Участвует в смене",
      "wallpaper.notInRotation": "Не участвует в смене",
      "wallpaper.rotationOff": "Автоматическая смена выключена.",
      "wallpaper.rotationAll": "В смене участвуют все обои ({total}).",
      "wallpaper.rotationPicked": "В смене участвуют {n} из {total}.",
      "unit.minutes": "Минуты",
      "unit.hours": "Часы",

      "alert.importOk": "Импорт успешно завершён",
      "alert.importErr": "Ошибка импорта: {message}",
      "alert.saveErr": "Ошибка сохранения: {message}",
      "alert.bgErr": "Не удалось загрузить изображение: {message}",
      "alert.resetErr": "Не удалось выполнить сброс: {message}",
      "error.unknown": "неизвестная ошибка",
      "error.generic": "ошибка",
      "error.loadFailed": "Не удалось загрузить данные с сервера.",
    },
    en: {
      "common.cancel": "Cancel",
      "common.save": "Save",
      "common.delete": "Delete",
      "common.add": "Add",
      "common.close": "Close",
      "common.done": "Done",
      "common.export": "Export",
      "common.import": "Import",

      "search.clear": "Clear",
      "search.engine": "Search engine",
      "search.engineAria": "Search engine: {label}",
      "engine.yandex": "Yandex",
      "font.system": "System",

      "toolbar.add": "New item",
      "toolbar.theme": "Theme",
      "toolbar.wallpaper": "Background",
      "toolbar.settings": "Settings",

      "empty.state": "Nothing here yet. Click “New item” to add a service or a bookmark.",

      "item.modal.new": "New item",
      "item.modal.edit": "Edit item",
      "item.name": "Name",
      "item.name.ph": "For example, Nextcloud",
      "item.url": "URL",
      "item.icon": "Icon",
      "item.icon.fromSite": "Take from site",
      "item.autoPick": "Match by name",
      "item.iconSearch.ph": "For example: nextcloud, proxmox, jellyfin",
      "item.iconFormat": "Icon format",
      "item.find": "Search",
      "item.category": "Category",
      "item.favorite": "Favorite",
      "item.display": "Display mode",
      "display.grid": "Main grid",
      "display.favorite": "Favorites",
      "display.block": "Category block",
      "item.iconBgMode": "Icon background",
      "item.iconBgColor": "Background color",
      "iconBg.inherit": "Follow settings",
      "iconBg.on": "On",
      "iconBg.off": "Off",
      "item.healthCheck": "Check availability",
      "item.healthCheckType": "Check method",
      "check.http": "HTTP/HTTPS",
      "check.tcp": "TCP",
      "check.icmp": "ICMP",
      "format.svg": "Vector format",
      "format.webp": "Raster WebP",
      "format.png": "Raster PNG",

      "hint.iconSource": "Icons come from Dashboard Icons over a CDN.",
      "hint.widgetRest": "The remaining options live in the widget’s right-click menu.",
      "hint.displayBlock": "The item is shown only in its category block, one item per row.",
      "hint.displayBlockNone": "The item has no category, so it lands in the shared “No category” block.",
      "hint.iconBgInheritOn": "Card settings currently have icon backgrounds on.",
      "hint.iconBgInheritOff": "Card settings currently have icon backgrounds off.",
      "hint.checkTcp": "Opens a TCP connection to the host and port from the URL (80/443 by default).",
      "hint.checkIcmp": "Sends an ICMP echo to the host from the URL. Port and path are ignored.",
      "block.renameHint": "A block’s title is its category name; you can edit it right here.",

      "confirm.deleteItem": "Delete item?",
      "confirm.deleteItemNamed": "Delete “{name}”?",
      "confirm.deleteCategory": "Delete category “{name}”? Items stay, but lose their category.",
      "confirm.external": "Open an external link?\n{url}",
      "confirm.import": "Importing replaces the current services, bookmarks and categories. Continue?",
      "confirm.resetAppearance": "Reset the appearance settings to their defaults?",
      "confirm.resetCards": "Reset the card settings to their defaults?",

      "settings.title": "Settings",
      "settings.appearance": "Appearance",
      "settings.theme": "Theme",
      "settings.font": "Font",
      "settings.language": "Language",
      "settings.background": "Background",
      "settings.bgFile": "File from PC",
      "settings.bgReset": "Reset background",
      "settings.cards": "Cards",
      "settings.cardSize": "Size",
      "settings.columns": "Columns",
      "settings.sort": "Sorting",
      "settings.cardsAreaWidth": "Area width",
      "settings.cardIconBackground": "Icon background",
      "settings.iconBg": "Icon background color",
      "settings.opacity": "Transparency",
      "settings.opacityBlocks": "Blocks",
      "settings.opacityWidgets": "Widgets",
      "settings.opacitySearch": "Search bar",
      "settings.opacityButtons": "Buttons",
      "settings.categories": "Categories",
      "settings.blockSize": "Block size",
      "settings.newCategory.ph": "New category",
      "settings.widgets": "Widgets",
      "settings.search": "Search",
      "settings.searchEngine": "Search engine",
      "settings.width": "Width",
      "settings.height": "Height",
      "settings.engineSwitcher": "Search engine switcher",
      "settings.engineSwitcherShort": "Switcher",
      "settings.links": "Links",
      "settings.openIn": "Open",
      "settings.confirmExternal": "Confirm external",
      "settings.data": "Data",
      "settings.backup": "Backup",
      "settings.resetDefaults": "Reset to defaults",
      "settings.resetAppearance": "Appearance",
      "settings.resetCards": "Cards",

      "theme.light": "Light",
      "theme.dark": "Dark",
      "theme.light.alt": "Light theme",
      "theme.dark.alt": "Dark theme",
      "size.small": "Small",
      "size.medium": "Medium",
      "size.large": "Large",
      "columns.auto": "Auto",
      "sort.custom": "Custom order",
      "sort.name": "By name",
      "sort.category": "By category",
      "link.currentTab": "In the current tab",
      "link.newTab": "In a new tab",
      "link.currentTabShort": "Current tab",
      "link.newTabShort": "New tab",

      "menu.edit": "Edit",
      "menu.favoriteToggle": "Toggle favorite",
      "menu.recheck": "Check availability",
      "menu.monitoring": "Monitoring",

      "status.online": "Online",
      "status.offline": "Offline",
      "status.checking": "Checking...",
      "status.unknown": "Unknown",

      "monitor.period": "Period",
      "monitor.range.1h": "1 hour",
      "monitor.range.6h": "6 hours",
      "monitor.range.1d": "1 day",
      "monitor.range.7d": "7 days",
      "monitor.range.30d": "30 days",
      "monitor.recheck": "Check now",
      "monitor.checking": "Checking…",
      "monitor.loading": "Loading history…",
      "monitor.uptime": "Uptime",
      "monitor.current": "Now",
      "monitor.latency": "Latency",
      "monitor.latencyRange": "min {min} · max {max}",
      "monitor.outages": "Outages",
      "monitor.downtime": "Downtime",
      "monitor.longest": "Longest {duration}",
      "monitor.lastCheck": "Last check",
      "monitor.samplesCount": "checks: {count}",
      "monitor.availability": "Availability over time",
      "monitor.latencyChart": "Latency over time",
      "monitor.incidents": "Outages",
      "monitor.incidentsMore": "showing the last {shown} of {total}",
      "monitor.noIncidents": "No outages in this period.",
      "monitor.ongoing": "ongoing",
      "monitor.noData": "no data",
      "monitor.empty": "No checks were recorded in this period.",
      "monitor.checksOff": "Health checks are switched off in the settings — the history is not growing.",
      "monitor.itemChecksOff": "Health checks are disabled for this item.",
      "monitor.retention": "Check history is kept for {days} days.",
      "monitor.interval": "every {seconds} s",
      "monitor.error": "Could not load the history: {message}",
      "monitor.segTip": "{time} · {uptime}% up ({samples})",
      "monitor.segNoData": "{time} · no data",
      "monitor.reason.timeout": "Timeout",
      "monitor.reason.unreachable": "Unreachable",
      "monitor.reason.invalid_url": "Invalid URL",
      "monitor.reason.invalid_host": "Invalid host",
      "monitor.reason.http": "HTTP {status}",

      "widget.date": "Date",
      "widget.time": "Time",
      "widget.weather": "Weather",
      "widget.ping": "Ping",
      "widget.sticky": "Sticky Note",
      "sticky.expand": "Expand Sticky Note",
      "sticky.collapse": "Collapse",
      "sticky.bold": "Bold",
      "sticky.italic": "Italic",
      "sticky.underline": "Underline",
      "sticky.asTodo": "Checkbox item",
      "sticky.asBullet": "Bullet item",
      "sticky.asText": "Plain text",
      "sticky.addLine": "+ Item",
      "sticky.removeLine": "Remove line",
      "sticky.placeholder": "What needs doing?",
      "widget.speed": "Network speed",
      "speed.expand": "Network speed",
      "speed.collapse": "Collapse",
      "speed.server": "Server",
      "speed.auto": "Auto (nearest)",
      "speed.hint": "Measured over the HemmaHub server’s connection",
      "speed.run": "Check",
      "speed.running": "Measuring…",
      "speed.download": "Download",
      "speed.upload": "Upload",
      "speed.latency": "Latency",
      "speed.idle": "No measurement yet",
      "speed.doneVia": "Done · {server}",
      "speed.noUpload": "Done · {server} · this server does not measure upload",
      "speed.failed": "The measurement failed",
      "widget.settingsTitle": "{title} — settings",
      "widget.format": "Format",
      "widget.style": "Style",
      "widget.fontSize": "Font size",
      "widget.showSeconds": "Show seconds",
      "widget.place": "Location",
      "widget.city": "City",
      "widget.city.ph": "London",
      "widget.units": "Units",
      "date.full": "Full",
      "date.short": "Short",
      "date.numeric": "Numeric",
      "style.card": "Card",
      "style.minimal": "Minimal",
      "style.glass": "Glass",
      "place.auto": "Detect automatically",
      "place.city": "Set a city",

      "weather.clear": "Clear",
      "weather.mostlyClear": "Mostly clear",
      "weather.partlyCloudy": "Partly cloudy",
      "weather.overcast": "Overcast",
      "weather.fog": "Fog",
      "weather.rime": "Freezing fog",
      "weather.drizzle": "Drizzle",
      "weather.rainLight": "Light rain",
      "weather.rain": "Rain",
      "weather.rainHeavy": "Heavy rain",
      "weather.snowLight": "Light snow",
      "weather.snow": "Snow",
      "weather.snowHeavy": "Heavy snow",
      "weather.showers": "Showers",
      "weather.showersHeavy": "Heavy showers",
      "weather.thunder": "Thunderstorm",
      "weather.thunderHail": "Thunderstorm with hail",
      "weather.default": "Weather",
      "weather.loading": "Loading",
      "weather.myLocation": "Your location",
      "weather.errCity": "Set a city in the weather settings",
      "weather.errGeocode": "Could not look up the city",
      "weather.errNotFound": "City not found",
      "weather.errNoGeo": "This browser has no geolocation",
      "weather.errLocation": "Could not get your location",
      "weather.errFetch": "Could not fetch the weather",
      "weather.errGeneric": "Weather could not be loaded",

      "units.kmh": "km/h",
      "units.ms": "ms",
      "units.mbps": "Mbit/s",
      "units.secShort": "s",
      "units.minShort": "min",
      "units.hourShort": "h",
      "units.dayShort": "d",

      "ping.format.full": "Name + IP + ping",
      "ping.format.name": "Name + ping",
      "ping.format.latency": "Ping only",
      "ping.interval": "Interval (sec)",
      "ping.method": "Check method",
      "ping.hint": "Up to 4 addresses. For the TCP method a port can follow a colon, for example 192.168.1.10:445.",
      "ping.hostName.ph": "Resource name",
      "ping.empty": "Add an IP in the settings (right-click the widget → Edit)",
      "ping.checking": "Checking…",
      "ping.err": "Error",

      "category.none": "No category",
      "category.empty": "No categories yet",

      "icons.loadingCatalog": "Loading the Dashboard Icons catalog…",
      "icons.catalogUnavailable": "The catalog is unavailable right now. An icon URL can be entered by hand.",
      "icons.catalogError": "Could not load the Dashboard Icons catalog",
      "icons.found": "Found in {format}: {count}. Click an icon to pick it.",
      "icons.notFound": "Nothing found in {format}.",
      "icons.missingInFormat": "“{name}” is not available in {format} — the selected icon is unchanged.",
      "icons.switched": "The selected icon switched to {format}.",
      "icons.source": "Icons come from Dashboard Icons over a CDN. Format: {format}.",
      "icons.selected": "Icon selected: {name} ({format})",

      "site.needUrl": "Enter the site URL first.",
      "site.checking": "Checking the site icon…",
      "site.noIcon": "The site serves no icon file — pick an icon by hand.",
      "site.icon": "Site icon: {url}",
      "site.err": "Could not check the site icon: {message}",

      "bg.default": "Default background.",
      "bg.builtin": "A built-in background is selected.",
      "bg.uploaded": "An uploaded background is selected.",
      "bg.link": "A background from a link is selected.",
      "bg.color": "A solid colour fill is selected.",
      "bg.wallpaper": "Wallpaper",
      "bg.custom": "My background {n}",

      "wallpaper.title": "Background",
      "wallpaper.gallery": "Gallery",
      "wallpaper.upload": "Upload from PC",
      "wallpaper.palette": "Background colour",
      "wallpaper.paletteHint": "A flat fill instead of a wallpaper.",
      "wallpaper.customColor": "Custom colour",
      "wallpaper.rotation": "Automatic rotation",
      "wallpaper.rotationOn": "Change wallpaper automatically",
      "wallpaper.interval": "Interval",
      "wallpaper.unit": "Unit",
      "wallpaper.selectAll": "Select all",
      "wallpaper.clearAll": "Clear all",
      "wallpaper.inRotation": "Included in the rotation",
      "wallpaper.notInRotation": "Not in the rotation",
      "wallpaper.rotationOff": "Automatic rotation is off.",
      "wallpaper.rotationAll": "All {total} wallpapers take part.",
      "wallpaper.rotationPicked": "{n} of {total} wallpapers take part.",
      "unit.minutes": "Minutes",
      "unit.hours": "Hours",

      "alert.importOk": "Import finished successfully",
      "alert.importErr": "Import error: {message}",
      "alert.saveErr": "Could not save: {message}",
      "alert.bgErr": "Could not upload the image: {message}",
      "alert.resetErr": "Could not reset: {message}",
      "error.unknown": "unknown error",
      "error.generic": "error",
      "error.loadFailed": "Could not load data from the server.",
    },
  };

  // English is the default (v30): anything that is not an explicit "ru" is read as
  // English, so a fresh install and an unreadable/missing value land in the same
  // place.
  function currentLang() { return state.settings.language === "ru" ? "ru" : "en"; }
  function locale() { return LOCALES[currentLang()]; }

  // Missing keys fall back to English, then to the key itself, so a half-finished
  // translation degrades into readable text instead of blanks.
  function t(key, vars) {
    const dict = I18N[currentLang()] || I18N.en;
    let str = dict[key] ?? I18N.en[key] ?? key;
    if (vars) for (const [name, value] of Object.entries(vars)) str = str.split(`{${name}}`).join(String(value));
    return str;
  }

  function applyTranslations(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
    root.querySelectorAll("[data-i18n-ph]").forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
    root.querySelectorAll("[data-i18n-title]").forEach((n) => { n.title = t(n.dataset.i18nTitle); });
    root.querySelectorAll("[data-i18n-aria]").forEach((n) => { n.setAttribute("aria-label", t(n.dataset.i18nAria)); });
  }

  function engineLabel(id) {
    const key = `engine.${id}`;
    return I18N.en[key] ? t(key) : (SEARCH_ENGINES[id]?.label || "");
  }

  function fontLabel(id) {
    return id === "system" ? t("font.system") : (FONT_OPTIONS[id]?.[0] || id);
  }

  // ---------- API helpers ----------
  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error || msg; } catch (_) {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }

  async function loadAll() {
    const [items, categories, settings] = await Promise.all([
      api("/items"),
      api("/categories"),
      api("/settings"),
    ]);
    state.items = items;
    state.categories = categories;
    state.settings = settings;
    try { state.backgroundHistory = JSON.parse(settings.background_history || "[]"); } catch (_) { state.backgroundHistory = []; }

    // Migrate background URLs from older builds and remove references to missing local files.
    let backgroundChanged = false;
    state.backgroundHistory = state.backgroundHistory.map((url) => {
      const value = String(url || "");
      if (value.startsWith("/backgrounds/")) {
        backgroundChanged = true;
        return value.replace(/^\/backgrounds\//, "/api/backgrounds/");
      }
      return value;
    }).filter(Boolean);

    const activeBackground = String(state.settings.background || "");
    if (activeBackground.startsWith("/backgrounds/")) {
      state.settings.background = activeBackground.replace(/^\/backgrounds\//, "/api/backgrounds/");
      backgroundChanged = true;
    }

    const localBackgrounds = [...new Set([
      ...state.backgroundHistory.filter((url) => /^\/api\/backgrounds\//.test(url)),
      ...(state.settings.background && /^\/api\/backgrounds\//.test(state.settings.background) ? [state.settings.background] : []),
    ])];
    if (localBackgrounds.length) {
      const checks = await Promise.all(localBackgrounds.map(async (url) => {
        try {
          const response = await fetch(url, { method: "HEAD", cache: "no-store" });
          return [url, response.ok];
        } catch (_) {
          return [url, false];
        }
      }));
      const missing = new Set(checks.filter(([, ok]) => !ok).map(([url]) => url));
      if (missing.size) {
        state.backgroundHistory = state.backgroundHistory.filter((url) => !missing.has(url));
        if (missing.has(state.settings.background)) state.settings.background = "";
        backgroundChanged = true;
      }
    }

    if (backgroundChanged) {
      await api("/settings", { method: "PUT", body: JSON.stringify({ background: state.settings.background || "", background_history: JSON.stringify(state.backgroundHistory) }) });
    }

    applySettingsToUI();
    render();
    // The carousel runs whether or not its dialog was ever opened, and an import
    // may well have brought a different schedule with it.
    scheduleBackgroundRotation();
  }

  async function refreshHealthOnly() {
    try {
      const statuses = await api("/health/services");
      state.items.forEach((it) => {
        if (statuses[it.id]) it.health = statuses[it.id];
      });
      render();
    } catch (_) { /* silent - non critical */ }
  }

  // ---------- Settings persistence helpers ----------
  function normalizeSettingValue(value) {
    return value === true ? "true" : value === false ? "false" : String(value ?? "");
  }

  // Several keys in one PUT. Used where a pair of fields only makes sense
  // together — the rotation writes the new wallpaper and the timestamp it was
  // applied at, and a reload must never see one without the other.
  async function saveSettingsFields(values) {
    const body = {};
    for (const [key, value] of Object.entries(values)) body[key] = normalizeSettingValue(value);
    const updated = await api("/settings", { method: "PUT", body: JSON.stringify(body) });
    state.settings = updated;
    applySettingsToUI();
    return updated;
  }

  async function saveSettingsField(key, value) {
    return saveSettingsFields({ [key]: value });
  }

  function populateFonts() {
    const select = el("setFont");
    if (!select) return;
    select.innerHTML = Object.keys(FONT_OPTIONS)
      .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(fontLabel(id))}</option>`)
      .join("");
  }

  // ---------- Theme / settings application ----------
  // The four transparency sliders. Each is stored as "how much of the wallpaper
  // shows through", 0–100, which is the inverse of the CSS fill alpha it drives:
  // 100% transparent means no fill at all (the border and blur stay).
  const OPACITY_FIELDS = [
    { key: "block_transparency", input: "setBlockOpacity", output: "blockOpacityValue", cssVar: "--block-alpha", fallback: 90 },
    { key: "widget_transparency", input: "setWidgetOpacity", output: "widgetOpacityValue", cssVar: "--widget-alpha", fallback: 60 },
    { key: "search_transparency", input: "setSearchOpacity", output: "searchOpacityValue", cssVar: "--search-alpha", fallback: 60 },
    { key: "button_transparency", input: "setButtonOpacity", output: "buttonOpacityValue", cssVar: "--button-alpha", fallback: 60 },
  ];

  function transparencyPercent(field) {
    const raw = Number(state.settings[field.key]);
    return Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : field.fallback));
  }

  function applyTransparency(cssVar, percent) {
    document.documentElement.style.setProperty(cssVar, String((100 - percent) / 100));
  }

  // Static markup is re-translated only when the language actually changes, so
  // the frequent applySettingsToUI() calls never clobber text that JS has just
  // written into a translated node.
  let appliedLang = null;

  function applySettingsToUI() {
    const s = state.settings;
    const lang = currentLang();
    document.documentElement.setAttribute("lang", lang);
    if (lang !== appliedLang) {
      appliedLang = lang;
      applyTranslations(document);
    }
    const theme = s.theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-font", s.font || "system");
    document.documentElement.style.setProperty("--font-family", (FONT_OPTIONS[s.font] || FONT_OPTIONS.system)[1]);
    document.documentElement.setAttribute("data-card-size", s.card_size || "medium");
    document.documentElement.setAttribute("data-block-size", s.block_size || "medium");
    document.documentElement.style.setProperty("--cards-area-width", `${Math.min(100, Math.max(60, Number(s.cards_area_width || 100)))}%`);
    document.documentElement.setAttribute("data-columns", s.columns || "auto");
    document.documentElement.setAttribute("data-card-backdrop", "false");
    // The plain-icon switch is no longer an attribute on <html>: since v27 a card
    // can override it, so the renderer decides per card and tags the tile with
    // .icon-plain. Only the global colour still travels as a variable, as the
    // base fill for icon artwork.
    document.documentElement.style.setProperty("--icon-background", iconBackgroundColor());
    for (const field of OPACITY_FIELDS) applyTransparency(field.cssVar, transparencyPercent(field));
    document.documentElement.setAttribute("data-search-engine-visible", s.search_engine_visible !== "false" ? "true" : "false");
    document.documentElement.setAttribute("data-search-engine-style", "pill");
    document.documentElement.style.setProperty("--search-width", `${Math.max(280, Number(s.search_width || DEFAULT_SEARCH_WIDTH))}px`);
    document.documentElement.style.setProperty("--search-height", `${Math.max(38, Number(s.search_height || 38))}px`);
    document.documentElement.style.setProperty("--columns", s.columns && s.columns !== "auto" ? s.columns : "auto-fill");
    // The wallpaper setting holds either an image URL or a "#rrggbb" fill picked
    // from the palette (v27). A fill has to switch the image off explicitly,
    // otherwise the default gradient in :root would keep covering it.
    if (isColorBackground(s.background)) {
      document.documentElement.style.setProperty("--bg-image", "none");
      document.documentElement.style.setProperty("--bg-color", s.background);
    } else if (s.background) {
      document.documentElement.style.setProperty("--bg-image", `url("${s.background}")`);
      document.documentElement.style.removeProperty("--bg-color");
    } else {
      document.documentElement.style.removeProperty("--bg-image");
      document.documentElement.style.removeProperty("--bg-color");
    }

    const themeIcon = el("themeIcon");
    if (themeIcon) {
      // Icon always reflects the currently active theme (not the theme you'd switch to).
      themeIcon.src = theme === "dark" ? "/icons/dark_mode.svg" : "/icons/light_mode.svg";
      themeIcon.alt = theme === "dark" ? t("theme.dark.alt") : t("theme.light.alt");
    }

    const brand = el("brand");
    if (brand) {
      brand.hidden = true;
      brand.innerHTML = "";
    }

    if (el("searchEngine")) {
      populateSearchEngines();
      el("searchEngine").value = s.search_engine || "google";
      syncSearchEngineUI();
    }
    if (el("searchClear") && el("searchInput")) el("searchClear").hidden = !el("searchInput").value;
    syncIconFormatSwitch();
    renderWidgets();
    applyStickyNoteState();
    applySpeedWidgetState();
    // Block size, the search height and the widget row all change how much room
    // is left for the blocks, and none of them goes through render().
    scheduleFitBlocks();
  }

  function toggleTheme() {
    const current = state.settings.theme === "dark" ? "dark" : "light";
    const next = current === "light" ? "dark" : "light";
    saveSettingsField("theme", next);
  }

  // ---------- Rendering ----------
  function matchesSearch() {
    return true;
  }

  function sortItems(items) {
    const arr = [...items];
    if (state.sortMode === "name") {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sortMode === "category") {
      const catName = (id) => state.categories.find((c) => c.id === id)?.name || "\uFFFF";
      arr.sort((a, b) => catName(a.category_id).localeCompare(catName(b.category_id)) || a.name.localeCompare(b.name));
    } else {
      arr.sort((a, b) => a.sort_order - b.sort_order);
    }
    return arr;
  }

  function normalizeColor(value, fallback = "#ffffff") {
    const v = String(value || "").trim();
    return /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/.test(v) ? v : fallback;
  }

  // The `background` setting is one field holding two kinds of value: a URL, or a
  // hex fill from the wallpaper palette. A leading "#" tells them apart — every
  // wallpaper URL is a path or a data: URI, so neither can collide.
  function isColorBackground(value) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(value || "").trim());
  }

  // "Icons only" mode drops every tile fill, so the artwork sits straight on the
  // wallpaper. The renderer writes the tile colour as an inline style, which would
  // beat any stylesheet rule — so the inline background is omitted here instead.
  // The setting is stored inverted from the "Фон иконок" checkbox that drives it.
  function cardIconPlain() { return state.settings.card_icon_plain === "true"; }

  // One colour behind every icon, from Настройки → Карточки.
  function iconBackgroundColor() { return normalizeColor(state.settings.icon_background_color, "#ffffff"); }

  // v27: a card may override the global switch — 'on'/'off' decide for itself,
  // 'inherit' (the default for every existing card) follows Настройки → Карточки.
  function itemIconPlain(item) {
    const mode = item?.icon_background_mode;
    if (mode === "on") return false;
    if (mode === "off") return true;
    return cardIconPlain();
  }

  // The override brings its own colour; inheriting cards use the global one.
  function itemIconBackgroundColor(item) {
    return item?.icon_background_mode === "on"
      ? normalizeColor(item.icon_background_color, iconBackgroundColor())
      : iconBackgroundColor();
  }

  function iconHtml(item) {
    const plain = itemIconPlain(item);
    const iconBg = itemIconBackgroundColor(item);
    if (item.icon) {
      const fallback = escapeHtml(item.name.trim().charAt(0).toUpperCase() || "?");
      const bgStyle = plain ? "" : ` style="background:${escapeAttr(iconBg)}"`;
      const plate = plain ? "" : `<rect width="100" height="100" rx="18" fill="${tileColor(item)}"/>`;
      return `<img src="${escapeAttr(item.icon)}" alt="" loading="lazy" draggable="false"${bgStyle} onerror="this.onerror=null;this.classList.add('icon-fallback');this.src='data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${plate}<text x="50" y="64" text-anchor="middle" font-size="48" font-family="Arial" fill="white">${fallback}</text></svg>`)}'">`;
    }
    const letter = item.name.trim().charAt(0).toUpperCase() || "?";
    return item.type === "bookmark" ? "🔖" : letter;
  }

  // Marks the tile that must lose its fill. Applied per card instead of via an
  // attribute on <html>, so a global "off" and a card-level "on" can coexist.
  function tileClass(item) { return itemIconPlain(item) ? " icon-plain" : ""; }

  function tileStyle(item) {
    if (itemIconPlain(item)) return "";
    const bg = item.icon ? itemIconBackgroundColor(item) : tileColor(item);
    return `background:${escapeAttr(bg)};`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  const DASHBOARD_ICONS_CDN = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";
  const DASHBOARD_ICONS_TREE = "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/tree.json";
  // Dashboard Icons publishes every icon in three formats, but not every icon
  // exists in all of them (SVG covers ~2250 of ~2800 icons). Search results are
  // therefore filtered by the format selected in the icon picker, so a result
  // can always be rendered in that format.
  const DASHBOARD_ICON_FORMATS = ["svg", "webp", "png"];
  const DASHBOARD_ICON_FORMAT_LABELS = { svg: "SVG", webp: "WebP", png: "PNG" };
  const DASHBOARD_ICON_URL_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\/homarr-labs\/dashboard-icons\/(?:svg|webp|png)\/(.+)\.(?:svg|webp|png)$/i;

  function iconSearchFormat() {
    const format = state.settings.icon_search_format;
    return DASHBOARD_ICON_FORMATS.includes(format) ? format : "svg";
  }

  function iconFormatLabel(format) {
    return DASHBOARD_ICON_FORMAT_LABELS[format] || String(format).toUpperCase();
  }

  function dashboardIconUrl(name, format = iconSearchFormat()) {
    return `${DASHBOARD_ICONS_CDN}/${format}/${encodeURIComponent(name)}.${format}`;
  }

  function dashboardIconNameFromUrl(url) {
    const match = DASHBOARD_ICON_URL_RE.exec(String(url || "").trim());
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
  }

  function dashboardIconSlug(value) {
    return String(value || "")
      .trim().toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  let dashboardIconCatalogPromise = null;

  function emptyIconCatalog() {
    return Object.fromEntries(DASHBOARD_ICON_FORMATS.map((format) => [format, []]));
  }

  // Loads the icon names available per format. The tree is fetched once and
  // cached; a failed fetch is not cached so the next search can retry.
  function loadDashboardIconCatalog() {
    if (state.dashboardIcons.catalog) return Promise.resolve(state.dashboardIcons.catalog);
    if (!dashboardIconCatalogPromise) dashboardIconCatalogPromise = fetchDashboardIconCatalog();
    return dashboardIconCatalogPromise;
  }

  async function fetchDashboardIconCatalog() {
    state.dashboardIcons.loading = true;
    try {
      const res = await fetch(DASHBOARD_ICONS_TREE, { cache: "force-cache" });
      if (!res.ok) throw new Error(t("icons.catalogError"));
      const tree = await res.json();
      const catalog = emptyIconCatalog();
      DASHBOARD_ICON_FORMATS.forEach((format) => {
        const suffix = `.${format}`;
        const files = Array.isArray(tree?.[format]) ? tree[format] : [];
        catalog[format] = [...new Set(files
          .filter((name) => typeof name === "string" && name.endsWith(suffix))
          .map((name) => name.slice(0, -suffix.length)))];
      });
      state.dashboardIcons.catalog = catalog;
      return catalog;
    } catch (_) {
      dashboardIconCatalogPromise = null;
      return emptyIconCatalog();
    } finally {
      state.dashboardIcons.loading = false;
    }
  }

  function rankDashboardIcons(names, query) {
    const q = dashboardIconSlug(query);
    if (!q) return [];
    const terms = q.split("-").filter(Boolean);
    return names
      .map((name) => {
        const slug = dashboardIconSlug(name);
        let score = 0;
        if (slug === q) score += 1000;
        if (slug.startsWith(q)) score += 400;
        if (slug.includes(q)) score += 250;
        if (terms.every((t) => slug.includes(t))) score += 120;
        if (slug.includes("-light")) score -= 15;
        return { name, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 24);
  }

  function renderDashboardIconResults(results) {
    const box = el("iconSearchResults");
    state.dashboardIcons.results = results;
    if (!results.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const format = iconSearchFormat();
    box.hidden = false;
    box.innerHTML = results.map(({ name }) => {
      const url = dashboardIconUrl(name, format);
      return `<button type="button" class="icon-search-result" data-icon-url="${escapeAttr(url)}" data-icon-name="${escapeAttr(name)}" title="${escapeAttr(name)}.${format}"><img src="${escapeAttr(url)}" alt=""><span>${escapeHtml(name)}</span></button>`;
    }).join("");
  }

  async function searchDashboardIcons(query, note = "") {
    const hint = el("iconSearchHint");
    const format = iconSearchFormat();
    const label = iconFormatLabel(format);
    const setHint = (text) => { hint.textContent = [text, note].filter(Boolean).join(" "); };
    if (!state.dashboardIcons.catalog) setHint(t("icons.loadingCatalog"));
    const catalog = await loadDashboardIconCatalog();
    const names = catalog[format] || [];
    if (!names.length) {
      setHint(t("icons.catalogUnavailable"));
      renderDashboardIconResults([]);
      return;
    }
    const results = rankDashboardIcons(names, query);
    setHint(results.length
      ? t("icons.found", { format: label, count: results.length })
      : t("icons.notFound", { format: label }));
    renderDashboardIconResults(results);
  }

  function syncIconFormatSwitch() {
    const format = iconSearchFormat();
    document.querySelectorAll("#iconFormatSwitch [data-icon-format]").forEach((btn) => {
      const active = btn.dataset.iconFormat === format;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  // Keeps an already picked Dashboard Icons URL in sync with the chosen format.
  // Returns a note for the hint line, or "" when nothing had to be said.
  async function retargetSelectedIcon(format) {
    const input = el("itemIcon");
    const name = dashboardIconNameFromUrl(input.value);
    if (!name) return "";
    const catalog = await loadDashboardIconCatalog();
    const names = catalog[format] || [];
    if (names.length && !names.includes(name)) {
      return t("icons.missingInFormat", { name, format: iconFormatLabel(format) });
    }
    const url = dashboardIconUrl(name, format);
    if (url === input.value) return "";
    input.value = url;
    return t("icons.switched", { format: iconFormatLabel(format) });
  }

  async function autoPickDashboardIcon() {
    const name = el("itemName").value.trim();
    if (!name) return;
    el("iconSearchInput").value = name;
    await searchDashboardIcons(name);
  }

  // ---------- Site icon (favicon) ----------
  // When the URL points at a site, the server reads that site's markup, picks
  // the best declared icon and verifies the file really exists; the checked URL
  // then becomes the card icon.
  function siteUrlFromInput(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
    try {
      const url = new URL(withScheme);
      return /^https?:$/.test(url.protocol) && url.hostname ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function setSiteIconHint(text) {
    const hint = el("itemFaviconHint");
    if (!hint) return;
    hint.textContent = text || "";
    hint.hidden = !text;
  }

  async function fetchSiteIcon(siteUrl, { refresh = false } = {}) {
    const data = await api(`/favicon?url=${encodeURIComponent(siteUrl)}${refresh ? "&refresh=1" : ""}`);
    return data?.url || "";
  }

  // Fills the icon field from the site itself. An icon the user picked by hand
  // is never overwritten automatically — only an empty field or a value this
  // detection put there earlier.
  async function applySiteIcon({ manual = false } = {}) {
    const input = el("itemIcon");
    if (!input) return;
    const siteUrl = siteUrlFromInput(el("itemUrl").value);
    if (!siteUrl) {
      if (manual) setSiteIconHint(t("site.needUrl"));
      return;
    }
    const current = input.value.trim();
    if (!manual && current && current !== state.siteIcon.applied) return;
    if (!manual && state.siteIcon.checked === siteUrl) return;
    state.siteIcon.checked = siteUrl;
    setSiteIconHint(t("site.checking"));
    try {
      const iconUrl = await fetchSiteIcon(siteUrl, { refresh: manual });
      // The modal may have been reused for another item while we were waiting.
      if (siteUrlFromInput(el("itemUrl").value) !== siteUrl) return;
      if (!iconUrl) {
        setSiteIconHint(t("site.noIcon"));
        return;
      }
      input.value = iconUrl;
      state.siteIcon.applied = iconUrl;
      setSiteIconHint(t("site.icon", { url: iconUrl }));
    } catch (err) {
      setSiteIconHint(t("site.err", { message: err.message }));
    }
  }

  function cardHtml(item) {
    const healthCheckOn = item.type === "service" && item.health_check_enabled !== false;
    const statusClass = healthCheckOn ? (item.health?.status || "unknown") : "";
    const statusBadge = healthCheckOn
      ? `<span class="status-badge ${statusClass}" title="${statusLabel(statusClass)}" aria-label="${statusLabel(statusClass)}"></span>`
      : "";
    return `
      <div class="card" data-id="${item.id}" data-url="${escapeAttr(item.url)}">
        <div class="card-icon${tileClass(item)}" style="${tileStyle(item)}">
          ${iconHtml(item)}
          ${statusBadge}
        </div>
        <div class="card-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
      </div>`;
  }

  function statusLabel(s) {
    return { online: t("status.online"), offline: t("status.offline"), checking: t("status.checking"), unknown: t("status.unknown") }[s] || t("status.unknown");
  }

  // One row of a category block: status dot, then the icon, then the name.
  function blockRowHtml(item) {
    const healthCheckOn = item.type === "service" && item.health_check_enabled !== false;
    const statusClass = healthCheckOn ? (item.health?.status || "unknown") : "";
    const statusDot = healthCheckOn
      ? `<span class="status-badge block-status ${statusClass}" title="${statusLabel(statusClass)}" aria-label="${statusLabel(statusClass)}"></span>`
      : `<span class="block-status block-status-none" aria-hidden="true"></span>`;
    return `
      <div class="block-item card" data-id="${item.id}" data-url="${escapeAttr(item.url)}">
        ${statusDot}
        <div class="card-icon block-icon${tileClass(item)}" style="${tileStyle(item)}">${iconHtml(item)}</div>
        <div class="card-name block-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
      </div>`;
  }

  // Blocks are grouped by category and ordered like the category list, so a
  // block does not jump around when items are added. "No category" comes last.
  function blocksHtml(items) {
    const groups = new Map();
    items.forEach((it) => {
      const key = it.category_id ?? "none";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });
    const keys = [...state.categories.map((c) => c.id), "none"].filter((key) => groups.has(key));
    return keys
      .map((key) => {
        const rows = sortItems(groups.get(key)).map(blockRowHtml).join("");
        if (key === "none") {
          // Not a real category, so its title is not editable.
          return `<div class="block" data-category="none"><div class="block-title block-title-static">${escapeHtml(t("category.none"))}</div><div class="block-body" data-drop-mode="block" data-drop-category="none">${rows}</div></div>`;
        }
        const name = state.categories.find((c) => c.id == key)?.name || "—";
        return `<div class="block" data-category="${key}">
            <div class="block-title" contenteditable="plaintext-only" spellcheck="false" role="textbox"
                 data-category="${key}" title="${escapeAttr(t("block.renameHint"))}">${escapeHtml(name)}</div>
            <div class="block-body" data-drop-mode="block" data-drop-category="${key}">${rows}</div>
          </div>`;
      })
      .join("");
  }

  function render() {
    state.sortMode = state.settings.sort_mode || state.sortMode || "custom";
    const visible = state.items.filter(matchesSearch);
    const buckets = { grid: [], favorite: [], block: [] };
    visible.forEach((item) => buckets[displayMode(item)].push(item));

    // Favorites
    const favorites = sortItems(buckets.favorite);
    el("favoritesSection").hidden = favorites.length === 0;
    el("favoritesGrid").innerHTML = favorites.map(cardHtml).join("");

    // All items (grouped by category when sortMode === category, else flat sorted)
    const container = el("itemsContainer");
    const sorted = sortItems(buckets.grid);
    el("allSection").hidden = sorted.length === 0;

    if (state.sortMode === "category") {
      const groups = new Map();
      sorted.forEach((it) => {
        const key = it.category_id ?? "none";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      });
      let html = "";
      for (const [key, groupItems] of groups.entries()) {
        const name = key === "none" ? t("category.none") : (state.categories.find((c) => c.id == key)?.name || "—");
        html += `<div class="category-block"><h3>${escapeHtml(name)}</h3><div class="grid" data-drop-mode="grid" data-drop-category="${escapeAttr(String(key))}">${groupItems.map(cardHtml).join("")}</div></div>`;
      }
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div class="grid" id="mainGrid" data-drop-mode="grid">${sorted.map(cardHtml).join("")}</div>`;
    }

    // Category blocks. render() also runs on the 15s health poll, and replacing
    // the section's markup would wipe an in-progress inline title edit along
    // with the caret — so leave it standing while a title has focus.
    const blocks = el("blocksSection");
    const focused = document.activeElement;
    const titleBeingEdited = focused && focused.isContentEditable && blocks.contains(focused);
    if (!titleBeingEdited) {
      blocks.hidden = buckets.block.length === 0;
      blocks.innerHTML = buckets.block.length ? blocksHtml(buckets.block) : "";
    }

    el("emptyState").hidden = state.items.length > 0;

    // Only freshly built markup needs listeners. When the blocks section was
    // preserved above, re-binding it would stack a second copy of every handler
    // on each poll, so the card pass is scoped to the two rebuilt containers.
    if (titleBeingEdited) {
      attachCardEvents(el("favoritesGrid"));
      attachCardEvents(el("itemsContainer"));
    } else {
      attachCardEvents();
      attachBlockTitleEvents();
    }
    // Synchronously, not on the next frame: the freshly built one-column blocks
    // must never get painted before they are split, or the page would flash a
    // scrollbar on every render.
    fitBlocks();
  }

  // The gap kept between the last row of content and whatever sits at the very
  // bottom of the screen (the ping dock, or nothing at all).
  const BOTTOM_GAP = 14;

  // The .app bottom padding is not decoration: it is the space the fixed ping
  // dock needs so the last row of content is not hidden underneath it. A static
  // value has to assume the widest dock, which on a normal screen means reserving
  // ~110px of empty air — and the block section pays for it in rows (v29). So it
  // is measured from the dock as rendered, and drops to a plain gap when the dock
  // is switched off.
  function updateBottomReserve() {
    const app = el("app");
    if (!app) return;
    const ping = el("pingWidget");
    const visible = ping && !ping.hidden && ping.offsetHeight > 0;
    const reserve = visible
      ? Math.ceil(window.innerHeight - ping.getBoundingClientRect().top) + BOTTOM_GAP
      : BOTTOM_GAP;
    app.style.setProperty("--app-pad-bottom", `${reserve}px`);
  }

  // ---------- Fitting the category blocks to the viewport ----------
  // The page is meant to hold everything on one screen, and blocks are the only
  // part of the layout that can trade height for width: a category with many
  // items must not be the reason the whole document scrolls. So the tallest
  // block keeps splitting its rows into another column until the section fits in
  // the room left between the cards above it and the ping dock below.
  const MAX_BLOCK_COLS = 4;
  // A column carrying one or two rows is a wider block, not a shorter one, so a
  // split has to leave at least this many rows per column.
  const MIN_ROWS_PER_BLOCK_COL = 3;
  // ...and a column narrower than this stops being a readable «dot · icon · name»
  // row, so the split is also capped by the width the section actually has.
  const MIN_BLOCK_COL_W = 150;
  // Below this width the blocks are stacked full-width by the stylesheet and the
  // page scrolls as a phone page normally does; the height clamp is a desktop
  // affordance and would only clip them there. Matches the CSS breakpoint.
  const BLOCK_FIT_MIN_VIEWPORT_W = 640;
  // Sub-pixel layout means a section can measure a hair over the budget it in
  // fact fills exactly. Splitting a block over half a pixel is the "it split too
  // early" bug, so the comparison is deliberately blunt (v29).
  const BLOCK_FIT_TOLERANCE = 2;

  function blockRowCount(block) {
    return block.querySelectorAll(".block-item").length;
  }

  function blockColumnCap(block) {
    const rows = blockRowCount(block);
    return Math.max(1, Math.min(MAX_BLOCK_COLS, Math.ceil(rows / MIN_ROWS_PER_BLOCK_COL)));
  }

  function blockCols(block) {
    return Number(block.dataset.cols) || 1;
  }

  // The row count travels with the column count because the grid needs an
  // explicit track list to fill column-first; deriving it in CSS is not possible.
  function setBlockCols(block, cols) {
    if (cols <= 1) {
      delete block.dataset.cols;
      block.style.removeProperty("--block-cols");
      block.style.removeProperty("--block-rows");
      return;
    }
    block.dataset.cols = String(cols);
    block.style.setProperty("--block-cols", String(cols));
    // Never zero: mid-drag a block can be emptied, and repeat(0, ...) is not a
    // track list.
    block.style.setProperty("--block-rows", String(Math.max(1, Math.ceil(blockRowCount(block) / cols))));
  }

  // How tall the blocks section may be before the page starts to scroll.
  // Everything above it is already laid out and does not move, and below it sit
  // only its own margin and the padding that keeps the fixed ping dock clear.
  // Measured against the document, not the viewport, so a page that is currently
  // scrolled (the very state this is meant to remove) still measures true.
  function availableBlocksHeight(section) {
    const app = el("app");
    const reserve = (parseFloat(getComputedStyle(section).marginBottom) || 0)
      + (app ? parseFloat(getComputedStyle(app).paddingBottom) || 0 : 0);
    const top = section.getBoundingClientRect().top + window.scrollY;
    return window.innerHeight - top - reserve;
  }

  function fitBlocks() {
    const section = el("blocksSection");
    // Mid-drag the section is holding ghost blocks and a card that belongs to
    // another container; it is re-fitted on drop, when it is whole again.
    if (!section || section.hidden || dropZonesArmed) return;
    section.classList.remove("blocks-scroll");
    section.style.removeProperty("--blocks-max-h");
    const blocks = [...section.querySelectorAll(".block")];
    if (!blocks.length) return;
    // The budget is read off the bottom padding, so that has to be true to the
    // dock before anything is measured against it.
    updateBottomReserve();
    // Always re-measure from one column: what fitted at the old window size,
    // block size or item count says nothing about what fits now.
    blocks.forEach((block) => setBlockCols(block, 1));
    const avail = availableBlocksHeight(section) + BLOCK_FIT_TOLERANCE;
    // A viewport with no room for even a single block is not worth reflowing for
    // — splitting would only make the panels wide as well as clipped.
    if (avail < 90) return;
    // No block may be split into columns thinner than a legible row.
    const widthCap = Math.max(1, Math.floor(section.clientWidth / MIN_BLOCK_COL_W));
    const maxed = new Set();
    for (let pass = 0; pass < blocks.length * MAX_BLOCK_COLS; pass++) {
      const before = section.offsetHeight;
      if (before <= avail) break;
      // One column per pass, always to the tallest block that can still take
      // one: the tallest block is what the section's height is made of.
      const candidate = blocks
        .filter((block) => !maxed.has(block) && blockCols(block) < Math.min(blockColumnCap(block), widthCap))
        .sort((a, b) => b.offsetHeight - a.offsetHeight)[0];
      if (!candidate) break;
      const cols = blockCols(candidate) + 1;
      setBlockCols(candidate, cols);
      // Widening a block can push a neighbour onto a second row and cost more
      // height than the extra column saved. Then the split is not worth making,
      // and this block is done — a third column would only widen it further.
      if (section.offsetHeight >= before) {
        setBlockCols(candidate, cols - 1);
        maxed.add(candidate);
      }
    }
    // The loop above splits greedily, so a block can end up carrying a column it
    // no longer needs once a later split shortened the section around it. Fewer
    // columns is always the nicer block, so every split is offered back (v29).
    for (const block of [...blocks].sort((a, b) => blockCols(b) - blockCols(a))) {
      while (blockCols(block) > 1) {
        const cols = blockCols(block);
        setBlockCols(block, cols - 1);
        if (section.offsetHeight > avail) { setBlockCols(block, cols); break; }
      }
    }
    // Some collections do not fit even fully split. The page still must not
    // scroll, so the section keeps the overflow to itself.
    if (window.innerWidth > BLOCK_FIT_MIN_VIEWPORT_W && section.offsetHeight > avail) {
      section.style.setProperty("--blocks-max-h", `${Math.floor(avail)}px`);
      section.classList.add("blocks-scroll");
    }
  }

  // Resize and late-arriving webfonts both change what fits, and neither is
  // worth more than one measurement per frame.
  let fitBlocksFrame = null;
  function scheduleFitBlocks() {
    if (fitBlocksFrame) cancelAnimationFrame(fitBlocksFrame);
    fitBlocksFrame = requestAnimationFrame(() => {
      fitBlocksFrame = null;
      // Also when there are no blocks at all: the grid above wants the room the
      // dock is not using just as much.
      updateBottomReserve();
      fitBlocks();
    });
  }
  window.addEventListener("resize", scheduleFitBlocks);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFitBlocks);

  // ---------- Widgets ----------
  function widgetClass(style) { return `widget wgt-style-${style || "card"}`; }

  const WIDGET_KEYS = ["date", "time", "weather"];
  // Date, time and weather share one default font size so the top bar reads as
  // a single row of controls.
  const WIDGET_FONT_SIZE_DEFAULT = 15;
  const WIDGET_DATE_FORMAT_DEFAULT = "numeric";
  // Widgets are fixed to a compact stack on the left side of the screen.
  // Position cannot be changed by the user; only which widgets are shown
  // and their stacking order (top to bottom) are configurable.

  function renderWidgets() {
    const s=state.settings||{}, wrap=el("widgets"), ping=el("pingWidget");
    const nodes={date:el("dateWidget"),time:el("timeWidget"),weather:el("weatherWidget")};
    if(!wrap||!nodes.date||!nodes.time||!nodes.weather||!ping)return;
    const enabled={date:s.widget_date_enabled==="true",time:s.widget_time_enabled==="true",weather:s.widget_weather_enabled==="true",ping:s.widget_ping_enabled==="true"};
    const configuredOrder=String(s.widget_order||"date,time,weather").split(",");
    const order=[...configuredOrder, "date", "time", "weather"].filter((key,i,arr)=>enabled[key]&&nodes[key]&&arr.indexOf(key)===i);
    Object.values(nodes).forEach(node=>{node.hidden=true;});
    order.forEach(key=>{nodes[key].hidden=false; wrap.appendChild(nodes[key]);});
    wrap.hidden=order.length===0;
    ping.hidden=!enabled.ping;
    if(wrap.hidden && !enabled.ping){ return; }
    const now=new Date();
    if(enabled.date){
      const format=s.widget_date_format||WIDGET_DATE_FORMAT_DEFAULT;
      const options=format==="short"?{weekday:"short",day:"2-digit",month:"short"}:format==="numeric"?{day:"2-digit",month:"2-digit",year:"numeric"}:{weekday:"long",day:"numeric",month:"long",year:"numeric"};
      nodes.date.className=widgetClass(s.widget_date_style)+" date-widget";
      nodes.date.style.setProperty("--widget-font-size",`${Number(s.widget_date_font_size||WIDGET_FONT_SIZE_DEFAULT)}px`);
      nodes.date.innerHTML=`<div class="widget-value">${escapeHtml(new Intl.DateTimeFormat(locale(),options).format(now))}</div>`;
    }
    if(enabled.time){
      const withSeconds=s.widget_time_seconds==="true", options={hour:"2-digit",minute:"2-digit"}; if(withSeconds)options.second="2-digit";
      nodes.time.className=widgetClass(s.widget_time_style)+" time-widget";
      nodes.time.style.setProperty("--widget-font-size",`${Number(s.widget_time_font_size||WIDGET_FONT_SIZE_DEFAULT)}px`);
      nodes.time.innerHTML=`<div class="widget-value">${escapeHtml(new Intl.DateTimeFormat(locale(),options).format(now))}</div>`;
    }
    if(enabled.weather){nodes.weather.style.setProperty("--widget-font-size",`${Number(s.widget_weather_font_size||WIDGET_FONT_SIZE_DEFAULT)}px`);renderWeatherWidget();}
    if(enabled.ping){renderPingWidget();}
  }

  function updateClockWidgets() {
    const s = state.settings || {};
    const now = new Date();
    const dateNode = el("dateWidget");
    const timeNode = el("timeWidget");
    if (s.widget_date_enabled === "true" && dateNode && !dateNode.hidden) {
      const format = s.widget_date_format || WIDGET_DATE_FORMAT_DEFAULT;
      const options = format === "short" ? { weekday: "short", day: "2-digit", month: "short" } : format === "numeric" ? { day: "2-digit", month: "2-digit", year: "numeric" } : { weekday: "long", day: "numeric", month: "long", year: "numeric" };
      const value = dateNode.querySelector(".widget-value");
      if (value) value.textContent = new Intl.DateTimeFormat(locale(), options).format(now);
    }
    if (s.widget_time_enabled === "true" && timeNode && !timeNode.hidden) {
      const withSeconds = s.widget_time_seconds === "true";
      const options = { hour: "2-digit", minute: "2-digit" };
      if (withSeconds) options.second = "2-digit";
      const value = timeNode.querySelector(".widget-value");
      if (value) value.textContent = new Intl.DateTimeFormat(locale(), options).format(now);
    }
  }

  let weatherRefreshTimer = null;
  let pingRefreshTimer = null;
  function scheduleWeatherRefresh() {
    clearTimeout(weatherRefreshTimer);
    if (state.settings.widget_weather_enabled !== "true") return;
    weatherRefreshTimer = setTimeout(() => { state.weather.data = null; renderWeatherWidget(); }, 15 * 60 * 1000);
  }

  async function getWeatherLocation() {
    const s = state.settings;
    if ((s.widget_weather_location_mode || "auto") === "city") {
      const city = (s.widget_weather_city || "").trim();
      if (!city) throw new Error(t("weather.errCity"));
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${currentLang()}&format=json`);
      if (!geoRes.ok) throw new Error(t("weather.errGeocode"));
      const geo = await geoRes.json();
      if (!geo.results?.length) throw new Error(t("weather.errNotFound"));
      const r = geo.results[0];
      return { latitude: r.latitude, longitude: r.longitude, label: [r.name, r.country].filter(Boolean).join(", ") };
    }
    if (!navigator.geolocation) throw new Error(t("weather.errNoGeo"));
    return await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, label: t("weather.myLocation") }),
      () => reject(new Error(t("weather.errLocation"))),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 15 * 60 * 1000 }
    ));
  }

  // Open-Meteo weather codes mapped to an icon and a translation key.
  const WEATHER_CODES = {
    0: ["☀️", "weather.clear"], 1: ["🌤️", "weather.mostlyClear"], 2: ["⛅", "weather.partlyCloudy"], 3: ["☁️", "weather.overcast"],
    45: ["🌫️", "weather.fog"], 48: ["🌫️", "weather.rime"],
    51: ["🌦️", "weather.drizzle"], 53: ["🌦️", "weather.drizzle"], 55: ["🌧️", "weather.drizzle"],
    61: ["🌧️", "weather.rainLight"], 63: ["🌧️", "weather.rain"], 65: ["🌧️", "weather.rainHeavy"],
    71: ["🌨️", "weather.snowLight"], 73: ["🌨️", "weather.snow"], 75: ["❄️", "weather.snowHeavy"],
    80: ["🌦️", "weather.showers"], 81: ["🌦️", "weather.showers"], 82: ["⛈️", "weather.showersHeavy"],
    95: ["⛈️", "weather.thunder"], 96: ["⛈️", "weather.thunderHail"], 99: ["⛈️", "weather.thunderHail"],
  };

  function weatherDescription(code) {
    const [icon, key] = WEATHER_CODES[code] || ["🌡️", "weather.default"];
    return [icon, t(key)];
  }

  async function loadWeather() {
    if (state.weather.loading) return;
    state.weather.loading = true; state.weather.error = null;
    try {
      const loc = await getWeatherLocation();
      const s = state.settings;
      const units = s.widget_weather_units === "imperial";
      const params = new URLSearchParams({
        latitude: loc.latitude, longitude: loc.longitude,
        current: "temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m",
        temperature_unit: units ? "fahrenheit" : "celsius",
        wind_speed_unit: units ? "mph" : "kmh",
        timezone: "auto",
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!res.ok) throw new Error(t("weather.errFetch"));
      const data = await res.json();
      state.weather.data = { ...data.current, label: loc.label, unit: units ? "°F" : "°C", windUnit: units ? "mph" : t("units.kmh") };
      state.weather.location = loc;
    } catch (err) {
      state.weather.error = err.message || t("weather.errGeneric");
    } finally {
      state.weather.loading = false;
      renderWeatherWidget();
      scheduleWeatherRefresh();
    }
  }

  function renderWeatherWidget() {
    const w = el("weatherWidget");
    if (state.settings.widget_weather_enabled !== "true") return;
    w.className = widgetClass(state.settings.widget_weather_style) + " weather-widget";
    w.style.setProperty("--widget-font-size", `${Number(state.settings.widget_weather_font_size || WIDGET_FONT_SIZE_DEFAULT)}px`);
    if (state.weather.loading) {
      w.innerHTML = `<div class="weather-main"><span class="weather-icon">…</span><span class="weather-temp">—</span><span class="weather-description">${escapeHtml(t("weather.loading"))}</span></div>`;
      return;
    }
    if (state.weather.error) {
      w.innerHTML = `<div class="weather-main"><span class="weather-icon">⚠️</span><span class="weather-description">${escapeHtml(state.weather.error)}</span></div>`;
      return;
    }
    if (!state.weather.data) {
      w.innerHTML = `<div class="weather-main"><span class="weather-icon">…</span><span class="weather-temp">—</span></div>`;
      loadWeather();
      return;
    }
    const d = state.weather.data;
    const [icon, description] = weatherDescription(d.weather_code);
    w.innerHTML = `<div class="weather-main"><span class="weather-icon">${icon}</span><span class="weather-temp">${Math.round(d.temperature_2m)}${d.unit}</span><span class="weather-description">${escapeHtml(description)}</span></div>`;
  }


  async function refreshPing() {
    const resources = getPingResources();
    const hosts = resources.map(r => r.host);
    if (!hosts.length || state.settings.widget_ping_enabled !== "true") { stopPingRefresh(); return; }
    if (state.ping.loading) return;
    state.ping.loading = true;
    try {
      const method = state.settings.widget_ping_method === "tcp" ? "tcp" : "icmp";
      const result = await api("/ping", { method: "POST", body: JSON.stringify({ hosts, method }) });
      state.ping.data = Array.isArray(result?.results) ? result.results : [];
    } catch (_) {
      state.ping.data = hosts.map(host => ({ host, ok: false, latency: null, error: t("ping.err") }));
    } finally {
      state.ping.loading = false;
      renderPingWidget();
    }
  }

  function getPingResources() {
    let raw = [];
    try { raw = JSON.parse(state.settings.widget_ping_hosts || "[]"); } catch (_) {}
    if (!Array.isArray(raw)) raw = [];
    return raw.map(v => {
      if (typeof v === "string") return { name: "", host: String(v).trim() };
      return { name: String(v?.name || "").trim(), host: String(v?.host || "").trim() };
    }).filter(v => v.host).slice(0, 4);
  }

  function getPingHosts() {
    return getPingResources().map(v => v.host);
  }

  function renderPingWidget() {
    const w = el("pingWidget");
    if (!w || state.settings.widget_ping_enabled !== "true") return;
    const resources = getPingResources();
    const hosts = resources.map(r => r.host);
    const style = "card";
    const format = state.settings.widget_ping_format || "full";
    w.className = widgetClass(style) + " ping-widget";
    if (!hosts.length) {
      stopPingRefresh();
      w.innerHTML = `<div class="ping-empty">${escapeHtml(t("ping.empty"))}</div>`;
      scheduleFitBlocks();
      return;
    }
    if (!state.ping.data.length) {
      w.innerHTML = `<div class="ping-list"><span class="ping-loading">${escapeHtml(t("ping.checking"))}</span></div>`;
      scheduleFitBlocks();
      if (!state.ping.loading) refreshPing();
      return;
    }
    const byHost = new Map((state.ping.data || []).map(r => [r.host, r]));
    w.innerHTML = `<div class="ping-list">${resources.map(res => {
      const r = byHost.get(res.host);
      const online = r?.ok;
      const latency = r?.latency != null ? `${Math.round(r.latency)} ${t("units.ms")}` : "—";
      const label = res.name || res.host;
      let inner;
      if (format === "latency") {
        inner = `<span class="ping-latency">${latency}</span>`;
      } else if (format === "name") {
        inner = `<span class="ping-host">${escapeHtml(label)}</span><span class="ping-latency">${latency}</span>`;
      } else {
        const suffix = res.name ? ` (${escapeHtml(res.host)})` : "";
        inner = `<span class="ping-host">${escapeHtml(label)}${suffix}</span><span class="ping-latency">${latency}</span>`;
      }
      return `<div class="ping-row"><span class="ping-dot ${online ? "online" : "offline"}"></span>${inner}</div>`;
    }).join("")}</div>`;
    // The dock is what the bottom reserve is measured from, so its height
    // changing is a layout change for the blocks above it (v29).
    scheduleFitBlocks();
    if (!pingRefreshTimer) schedulePingRefresh();
  }

  function stopPingRefresh() {
    clearTimeout(pingRefreshTimer);
    clearInterval(pingRefreshTimer);
    pingRefreshTimer = null;
  }

  function schedulePingRefresh() {
    stopPingRefresh();
    if (state.settings.widget_ping_enabled !== "true" || !getPingHosts().length) return;
    const interval = Math.max(3, Number(state.settings.widget_ping_interval || 10)) * 1000;
    pingRefreshTimer = setInterval(() => refreshPing(), interval);
  }

  // ---------- Card interactions ----------
  function attachCardEvents(container = document) {
    container.querySelectorAll(".card[data-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        // A drag ends with a pointerup on the tile it started from, which the
        // browser still reports as a click — without this guard every
        // rearrangement would also open the site.
        if (clickCameFromDrag()) return;
        openItem(card.dataset.id);
      });

      card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        // On a touch screen the long press *is* the drag gesture, and the
        // browser fires contextmenu in the middle of it.
        if (drag || clickCameFromDrag()) return;
        showContextMenu(e.clientX, e.clientY, card.dataset.id);
      });

      card.addEventListener("pointerdown", (e) => armCardDrag(e, card));
    });
  }

  // ---------- Cross-container drag & drop ----------
  // Where an item sits *is* its «Способ отображения», so dragging it into another
  // container has to rewrite that setting (and, for a block, the category) rather
  // than only its position (v27). Every container that accepts cards carries
  // data-drop-mode; blocks and the grouped grids add data-drop-category.
  //
  // Driven by pointer events instead of the HTML5 drag API (v29). The API is not
  // implemented for touch input at all, and inside a tile the icon <img> is
  // natively draggable, so a press on the icon made the browser drag the picture
  // rather than the card. Pointer events also give the same code path for mouse,
  // pen and finger, and let the item follow the cursor as a real floating copy.
  const DRAG_MOVE_THRESHOLD = 6;
  // A finger has to rest before it starts moving things, or every swipe would
  // rearrange the page.
  const DRAG_TOUCH_HOLD_MS = 300;
  const DRAG_AUTOSCROLL_EDGE = 46;
  const DRAG_AUTOSCROLL_STEP = 18;
  // How long after a drag a click is still assumed to belong to it.
  const DRAG_CLICK_GRACE_MS = 350;

  // The press currently being watched: null between gestures, and `active: false`
  // until it has travelled far enough (or been held long enough) to be a drag
  // rather than a tap.
  let drag = null;
  let dragEndedAt = -Infinity;
  // True from the moment the drop zones are conjured until they are taken down.
  // The layout is not the real one in between (empty sections are open and unused
  // categories have ghost blocks), so nothing may be measured against it.
  let dropZonesArmed = false;

  function clickCameFromDrag() {
    return performance.now() - dragEndedAt < DRAG_CLICK_GRACE_MS;
  }

  function armCardDrag(e, card) {
    if (drag || openOverlays().length) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag = {
      card,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offX: 0,
      offY: 0,
      active: false,
      ghost: null,
      holdTimer: null,
      // Where the tile came from, so a cancelled drag can put it back.
      home: { parent: card.parentElement, next: card.nextElementSibling },
    };
    window.addEventListener("pointermove", onDragPointerMove, { passive: false });
    window.addEventListener("pointerup", onDragPointerUp);
    window.addEventListener("pointercancel", cancelDrag);
    if (drag.pointerType === "touch") {
      drag.holdTimer = setTimeout(() => { if (drag && !drag.active) beginDrag(); }, DRAG_TOUCH_HOLD_MS);
    }
  }

  function releaseDragListeners() {
    window.removeEventListener("pointermove", onDragPointerMove);
    window.removeEventListener("pointerup", onDragPointerUp);
    window.removeEventListener("pointercancel", cancelDrag);
    if (drag) { clearTimeout(drag.holdTimer); drag.holdTimer = null; }
  }

  function beginDrag() {
    clearTimeout(drag.holdTimer);
    drag.holdTimer = null;
    drag.active = true;
    const rect = drag.card.getBoundingClientRect();
    // The copy keeps the grab point under the pointer, so the tile does not jump
    // out from under the finger when the drag starts.
    drag.offX = drag.startX - rect.left;
    drag.offY = drag.startY - rect.top;
    const ghost = drag.card.cloneNode(true);
    ghost.className = `${drag.card.className} drag-ghost`;
    ghost.removeAttribute("data-id");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    document.body.classList.add("dragging-item");
    // The original stays in place as the live placeholder: it is the thing the
    // insertion logic moves around, so the layout previews the result.
    drag.card.classList.add("dragging");
    armDropZones();
    moveDragGhost();
  }

  function moveDragGhost() {
    if (!drag || !drag.ghost) return;
    drag.ghost.style.transform = `translate3d(${Math.round(drag.x - drag.offX)}px, ${Math.round(drag.y - drag.offY)}px, 0)`;
  }

  function onDragPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) <= DRAG_MOVE_THRESHOLD) return;
      // A finger that moves before the hold has elapsed is scrolling the page,
      // not picking anything up.
      if (drag.pointerType === "touch") { releaseDragListeners(); drag = null; return; }
      beginDrag();
    }
    // Stops the press from turning into a text selection halfway through.
    e.preventDefault();
    moveDragGhost();
    updateDropTarget();
  }

  function onDragPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    releaseDragListeners();
    if (!drag.active) { drag = null; return; }
    const card = drag.card;
    endDragVisuals();
    // Read the target before the ghost zones come down: the card may be sitting
    // in a block that only exists for the duration of the drag.
    const zone = card.closest("[data-drop-mode]");
    drag = null;
    dragEndedAt = performance.now();
    if (zone) commitDrop(zone, card);
    disarmDropZones();
    // Only now is the section back to what it really holds, so this is the first
    // honest measurement — and it has to happen before the next paint, or the
    // page flashes the unsplit blocks the drop left behind.
    fitBlocks();
  }

  // Escape and a system-cancelled gesture both mean «forget it»: the tile goes
  // back where the press started and nothing is saved.
  function cancelDrag() {
    if (!drag) return;
    const { card, home, active } = drag;
    releaseDragListeners();
    drag = null;
    if (!active) return;
    endDragVisuals();
    if (home.parent && home.parent.isConnected) home.parent.insertBefore(card, home.next);
    disarmDropZones();
    dragEndedAt = performance.now();
    // Rebuilt from state, which the cancelled drag never touched.
    render();
  }

  function endDragVisuals() {
    // Queried, not taken from `drag`: a cancelled gesture has already dropped its
    // bookkeeping by the time the visuals come down.
    document.querySelectorAll(".drag-ghost").forEach((ghost) => ghost.remove());
    document.querySelectorAll(".card.dragging").forEach((c) => c.classList.remove("dragging"));
    document.querySelectorAll(".drop-over").forEach((zone) => zone.classList.remove("drop-over"));
    document.body.classList.remove("dragging-item");
  }

  // The floating copy does not take pointer events, so the element under the
  // cursor is the real drop target.
  function updateDropTarget() {
    const under = document.elementFromPoint(drag.x, drag.y);
    const zone = under && under.closest("[data-drop-mode]");
    if (zone) {
      const overCard = under.closest(".card[data-id]");
      if (overCard && overCard !== drag.card && overCard.parentElement === zone) {
        insertDraggedNear(overCard);
      } else if (drag.card.parentElement !== zone) {
        // Empty space in a zone parks the card at the end.
        zone.appendChild(drag.card);
      }
      document.querySelectorAll(".drop-over").forEach((z) => { if (z !== zone) z.classList.remove("drop-over"); });
      zone.classList.add("drop-over");
      // A block that has gained or lost a row needs its column tracks rebuilt,
      // or the preview would spill outside the panel.
      refreshSplitBlockRows();
    }
    autoScrollForDrag(zone || document.body);
  }

  function insertDraggedNear(card) {
    const grid = card.parentElement;
    const rect = card.getBoundingClientRect();
    // Block rows stack vertically, cards wrap horizontally.
    const horizontal = !grid.classList.contains("block-body");
    let before;
    if (horizontal) {
      before = drag.x < rect.left + rect.width / 2;
    } else if (blockCols(card.closest(".block") || grid) > 1) {
      // A split block reads column-first, so which side of the row the pointer
      // is on decides across columns and the midpoint only inside one: dropping
      // to the right of a column must land after it, however high up that puts
      // the cursor.
      before = drag.x < rect.left ? true
        : drag.x > rect.right ? false
        : drag.y < rect.top + rect.height / 2;
    } else {
      before = drag.y < rect.top + rect.height / 2;
    }
    grid.insertBefore(drag.card, before ? card : card.nextSibling);
  }

  function refreshSplitBlockRows() {
    document.querySelectorAll(".block[data-cols]").forEach((block) => setBlockCols(block, blockCols(block)));
  }

  // Long lists can outgrow their container (the block section keeps its own
  // overflow, and a phone scrolls the page), so the edges pull while dragging.
  function autoScrollForDrag(from) {
    let box = from;
    while (box && box !== document.body) {
      const overflow = getComputedStyle(box).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && box.scrollHeight > box.clientHeight + 2) break;
      box = box.parentElement;
    }
    if (box && box !== document.body) {
      const rect = box.getBoundingClientRect();
      if (drag.y < rect.top + DRAG_AUTOSCROLL_EDGE) box.scrollTop -= DRAG_AUTOSCROLL_STEP;
      else if (drag.y > rect.bottom - DRAG_AUTOSCROLL_EDGE) box.scrollTop += DRAG_AUTOSCROLL_STEP;
      return;
    }
    if (document.documentElement.scrollHeight <= window.innerHeight + 2) return;
    if (drag.y < DRAG_AUTOSCROLL_EDGE) window.scrollBy(0, -DRAG_AUTOSCROLL_STEP);
    else if (drag.y > window.innerHeight - DRAG_AUTOSCROLL_EDGE) window.scrollBy(0, DRAG_AUTOSCROLL_STEP);
  }

  // A finger that is moving a card must not also be scrolling the page. Only a
  // non-passive listener can say so, and only from the document — the card the
  // gesture started on may have been re-parented by then.
  document.addEventListener("touchmove", (e) => {
    if (drag && drag.active) e.preventDefault();
  }, { passive: false });

  function commitDrop(zone, dragging) {
    if (!zone.contains(dragging)) return;
    const item = state.items.find((i) => i.id == dragging.dataset.id);
    if (!item) return;
    const mode = zone.dataset.dropMode;
    const raw = zone.dataset.dropCategory;
    // Favorites and the ungrouped main grid are one flat list each, so a drop
    // there leaves the item's category alone.
    const category = raw === undefined
      ? item.category_id ?? null
      : (raw && raw !== "none" ? Number(raw) : null);
    const moved = displayMode(item) !== mode || (item.category_id ?? null) !== category;
    persistOrderFromDOM(zone);
    if (!moved) return;
    // Optimistic: the card is already sitting in its new container, so re-render
    // from local state and let the PUT confirm it.
    item.display_mode = mode;
    item.is_favorite = mode === "favorite";
    item.category_id = category;
    api(`/items/${item.id}`, { method: "PUT", body: JSON.stringify({ display_mode: mode, category_id: category }) })
      .then((updated) => { Object.assign(item, updated); render(); })
      .catch((err) => { alert(t("alert.saveErr", { message: err.message })); loadAll(); });
    render();
  }

  // Empty containers collapse to nothing, and an unused category renders no block
  // at all — so there would be nowhere to drop an item that is meant to become
  // the first favorite, or the first card of a category. For the duration of a
  // drag every container gets a floor height, and each missing block a ghost.
  function armDropZones() {
    dropZonesArmed = true;
    ["favoritesSection", "allSection", "blocksSection"].forEach((id) => {
      const section = el(id);
      if (!section || !section.hidden) return;
      section.hidden = false;
      section.dataset.dropArmed = "1";
    });
    const blocks = el("blocksSection");
    if (!blocks) return;
    const present = new Set([...blocks.querySelectorAll(".block[data-category]")].map((b) => b.dataset.category));
    const missing = [
      ...state.categories.map((c) => ({ key: String(c.id), name: c.name })),
      { key: "none", name: t("category.none") },
    ].filter((c) => !present.has(c.key));
    blocks.insertAdjacentHTML("beforeend", missing.map((c) =>
      `<div class="block block-placeholder" data-ghost="1" data-category="${escapeAttr(c.key)}">` +
      `<div class="block-title block-title-static">${escapeHtml(c.name)}</div>` +
      `<div class="block-body" data-drop-mode="block" data-drop-category="${escapeAttr(c.key)}"></div></div>`
    ).join(""));
  }

  function disarmDropZones() {
    document.body.classList.remove("dragging-item");
    document.querySelectorAll(".block[data-ghost]").forEach((ghost) => ghost.remove());
    document.querySelectorAll("[data-drop-armed]").forEach((section) => {
      delete section.dataset.dropArmed;
      // Hide again only what the drop left empty: a section that has just
      // received its first card has to stay on screen.
      if (!section.querySelector(".card[data-id]")) section.hidden = true;
    });
    document.querySelectorAll(".drop-over").forEach((zone) => zone.classList.remove("drop-over"));
    dropZonesArmed = false;
  }

  function persistOrderFromDOM(container, selector = ".card") {
    const ids = [...container.querySelectorAll(selector)].map((c) => c.dataset.id);
    const order = ids.map((id, idx) => ({ id: Number(id), sort_order: idx }));
    ids.forEach((id, idx) => {
      const item = state.items.find((i) => i.id == id);
      if (item) item.sort_order = idx;
    });
    api("/items/reorder/bulk", { method: "POST", body: JSON.stringify({ order }) }).catch(() => {});
  }

  // Renames a category in place and re-renders. Shared by the block titles and
  // the settings manager, so both surfaces see the new name immediately.
  async function renameCategory(id, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    const updated = await api(`/categories/${id}`, { method: "PUT", body: JSON.stringify({ name: trimmed }) });
    const cat = state.categories.find((c) => c.id == id);
    if (cat) cat.name = updated.name;
    renderCategoryManager();
    render();
  }

  // Block titles are editable inline: Enter commits, Escape cancels, and
  // leaving the field commits too. Both keys just blur — the blur handler below
  // is the only thing that saves, so Enter cannot fire two PUTs for one rename.
  function attachBlockTitleEvents() {
    document.querySelectorAll(".block-title[contenteditable]").forEach((title) => {
      title.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== "Escape") return;
        e.preventDefault();
        // Escape restores the stored name first, which leaves the field
        // unchanged and so makes the blur handler a no-op.
        if (e.key === "Escape") {
          title.textContent = state.categories.find((c) => c.id == title.dataset.category)?.name || "";
        }
        title.blur();
      });
      // Blur commits, but only when the text actually changed — typing nothing
      // and clicking away would otherwise fire a pointless PUT.
      title.addEventListener("blur", async () => {
        const id = title.dataset.category;
        const current = state.categories.find((c) => c.id == id)?.name || "";
        if (title.textContent.trim() === current) {
          title.textContent = current;
          return;
        }
        try {
          await renameCategory(id, title.textContent);
        } catch (err) {
          title.textContent = current;
          alert(t("alert.saveErr", { message: err.message }));
        }
      });
    });
  }

  function openItem(id) {
    const item = state.items.find((i) => i.id == id);
    if (!item) return;

    const isExternal = /^https?:\/\//i.test(item.url) && !/192\.168\.|10\.|localhost|127\.0\.0\.1/i.test(item.url);
    if (isExternal && state.settings.confirm_external_links === "true") {
      if (!confirm(t("confirm.external", { url: item.url }))) return;
    }

    const target = state.settings.link_behavior === "current_tab" ? "_self" : "_blank";
    window.open(item.url, target, "noopener,noreferrer");
  }

  // ---------- Context menu ----------
  let contextItemId = null;
  function showContextMenu(x, y, id) {
    contextItemId = id;
    const menu = el("contextMenu");
    const item = state.items.find((i) => i.id == id);
    // Monitoring only makes sense where there is history to show: a bookmark is
    // never probed, and neither is a service with its check switched off.
    const monitorBtn = menu.querySelector('[data-action="monitor"]');
    if (monitorBtn) monitorBtn.hidden = !item || item.type !== "service" || item.health_check_enabled === false;

    // Measured rather than assumed: the menu grew a fifth entry in v32, and the
    // constants this used to subtract were already one item out of date. Same
    // approach as positionPopover().
    menu.style.left = "-9999px";
    menu.style.top = "-9999px";
    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  }
  function hideContextMenu() { el("contextMenu").hidden = true; contextItemId = null; }

  el("contextMenu").addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (!action || !contextItemId) return;
    const item = state.items.find((i) => i.id == contextItemId);
    hideContextMenu();
    if (!item) return;

    if (action === "edit") openItemModal(item);
    if (action === "monitor") openMonitorModal(item);
    if (action === "favorite") {
      // Toggling favorite moves the item between the shelf and the main grid;
      // a block item is pulled onto the shelf first, then back to the grid.
      const next = displayMode(item) === "favorite" ? "grid" : "favorite";
      const updated = await api(`/items/${item.id}`, { method: "PUT", body: JSON.stringify({ display_mode: next }) });
      Object.assign(item, updated);
      render();
    }
    if (action === "recheck") {
      await api(`/items/${item.id}/recheck`, { method: "POST" });
      refreshHealthOnly();
    }
    if (action === "delete") {
      showConfirm(t("confirm.deleteItemNamed", { name: item.name }), async () => {
        await api(`/items/${item.id}`, { method: "DELETE" });
        state.items = state.items.filter((i) => i.id !== item.id);
        render();
      });
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#contextMenu") && !e.target.closest(".card")) hideContextMenu();
  });

  // ---------- Monitoring (v32) ----------
  // Availability history for one service. The server aggregates (src/history.js)
  // and answers with a summary, one entry per time bucket and a list of outages,
  // so everything here is drawing — no sample ever reaches the browser.
  //
  // The latency plot is built as an SVG string by hand. The project has no chart
  // library and this feature does not add one: three polylines and a few labels
  // are less code than the glue any dependency would need, and they render
  // through the same path as the rest of the UI.

  const MONITOR_RANGES = ["1h", "6h", "1d", "7d", "30d"];
  const MONITOR_REFRESH_MS = 30000;
  // Plot geometry in the SVG's own units. The viewBox stretches horizontally to
  // the modal width while the height stays fixed in pixels, so one unit of Y is
  // one pixel and the bottom margin is exactly where the offline ticks hang.
  const CHART = { w: 660, h: 116, top: 8, bottom: 14, left: 2, right: 2 };

  function openMonitorModal(item) {
    const m = state.monitor;
    m.itemId = item.id;
    m.data = null;
    m.error = null;
    m.loading = false;
    el("monitorName").textContent = item.name;
    el("monitorMeta").textContent = item.url;
    el("monitorNote").textContent = "";
    el("monitorModal").hidden = false;
    renderMonitor();
    loadMonitor();
    startMonitorRefresh();
  }

  function closeMonitorModal() {
    stopMonitorRefresh();
    // Bumping the request id drops any answer still in flight, so a late response
    // cannot repaint a window the user has already closed.
    state.monitor.requestId++;
    state.monitor.itemId = null;
    state.monitor.data = null;
    state.monitor.error = null;
    el("monitorModal").hidden = true;
  }

  function startMonitorRefresh() {
    stopMonitorRefresh();
    state.monitor.timer = setInterval(() => loadMonitor({ silent: true }), MONITOR_REFRESH_MS);
  }

  function stopMonitorRefresh() {
    if (state.monitor.timer) clearInterval(state.monitor.timer);
    state.monitor.timer = null;
  }

  // silent: a background refresh keeps the current picture on screen instead of
  // blanking it to "loading…" every 30 seconds.
  async function loadMonitor({ silent = false } = {}) {
    const m = state.monitor;
    const itemId = m.itemId;
    if (itemId == null) return;
    // Clicking through the periods fires overlapping requests, and they need not
    // come back in order — only the newest one is allowed to paint.
    const requestId = ++m.requestId;
    m.loading = true;
    if (!silent) renderMonitor();
    try {
      const data = await api(`/items/${itemId}/history?range=${encodeURIComponent(m.range)}`);
      if (requestId !== m.requestId) return;
      m.data = data;
      m.error = null;
    } catch (err) {
      if (requestId !== m.requestId) return;
      m.error = err?.message || t("error.generic");
    } finally {
      if (requestId === m.requestId) {
        m.loading = false;
        renderMonitor();
      }
    }
  }

  function renderMonitor() {
    const modal = el("monitorModal");
    if (!modal || modal.hidden) return;
    const m = state.monitor;
    const body = el("monitorBody");

    el("monitorRanges").innerHTML = MONITOR_RANGES.map((range) => {
      const active = range === m.range;
      return `<button type="button" class="monitor-range${active ? " is-active" : ""}" data-range="${range}" aria-pressed="${active}">${escapeHtml(t(`monitor.range.${range}`))}</button>`;
    }).join("");

    if (m.error) {
      body.innerHTML = `<p class="monitor-placeholder is-error">${escapeHtml(t("monitor.error", { message: m.error }))}</p>`;
      el("monitorNote").textContent = "";
      return;
    }
    if (!m.data) {
      body.innerHTML = `<p class="monitor-placeholder">${escapeHtml(t("monitor.loading"))}</p>`;
      return;
    }

    const d = m.data;
    el("monitorMeta").textContent = monitorMetaText(d);
    body.innerHTML = monitorSummaryHtml(d) + monitorBarHtml(d) + monitorChartHtml(d) + monitorIncidentsHtml(d);
    el("monitorNote").textContent = monitorNoteText(d);
  }

  function monitorMetaText(d) {
    const parts = [d.item.url, d.item.method.toUpperCase()];
    // The interval comes from the samples themselves, not from the setting: the
    // setting only describes the future, and it may well have been changed in the
    // middle of the period on screen.
    if (d.interval_s) parts.push(t("monitor.interval", { seconds: d.interval_s }));
    return parts.join(" · ");
  }

  function monitorNoteText(d) {
    const notes = [];
    if (!d.checks_enabled) notes.push(t("monitor.checksOff"));
    else if (!d.item.health_check_enabled) notes.push(t("monitor.itemChecksOff"));
    notes.push(t("monitor.retention", { days: d.retention_days }));
    return notes.join(" ");
  }

  function monitorTileHtml(tile) {
    return `
      <div class="monitor-tile">
        <span class="monitor-tile-label">${escapeHtml(tile.label)}</span>
        <span class="monitor-tile-value${tile.cls ? ` ${tile.cls}` : ""}">${escapeHtml(tile.value)}</span>
        <span class="monitor-tile-hint">${escapeHtml(tile.hint || "")}</span>
      </div>`;
  }

  function monitorSummaryHtml(d) {
    const s = d.summary;
    // The reason is only known while the service is still down — that outage is
    // the newest one in the list, and it is the one carrying an error.
    const ongoing = d.incidents.find((inc) => inc.ongoing);
    const currentHint = s.status === "offline"
      ? reasonLabel(ongoing?.error)
      : s.latency.last != null ? formatLatency(s.latency.last) : "";

    const tiles = [
      {
        label: t("monitor.uptime"),
        value: s.uptime == null ? "—" : `${s.uptime}%`,
        hint: s.samples ? t("monitor.samplesCount", { count: s.samples }) : t("monitor.noData"),
        cls: uptimeClass(s.uptime),
      },
      { label: t("monitor.current"), value: statusLabel(s.status), hint: currentHint, cls: `is-${s.status}` },
      {
        label: t("monitor.latency"),
        value: formatLatency(s.latency.avg),
        hint: s.latency.min != null ? t("monitor.latencyRange", { min: formatLatency(s.latency.min), max: formatLatency(s.latency.max) }) : "",
      },
      {
        label: t("monitor.outages"),
        value: String(s.outages),
        hint: s.longest_outage_ms ? t("monitor.longest", { duration: formatDuration(s.longest_outage_ms) }) : "",
      },
      { label: t("monitor.downtime"), value: s.downtime_ms ? formatDuration(s.downtime_ms) : "—", hint: "" },
      { label: t("monitor.lastCheck"), value: formatCheckTime(s.last_at), hint: "" },
    ];
    return `<div class="monitor-summary">${tiles.map(monitorTileHtml).join("")}</div>`;
  }

  // A bucket with no samples is its own state: the portal was not running, which
  // is not the same as the service having been down.
  function bucketClass(b) {
    if (!b.samples) return "is-none";
    if (b.up === b.samples) return "is-up";
    if (b.up === 0) return "is-down";
    return "is-partial";
  }

  function monitorBarHtml(d) {
    const segments = d.buckets.map((b) => {
      const when = formatBucketTime(b.t, d.bucket_ms);
      const title = b.samples
        ? t("monitor.segTip", {
            time: when,
            uptime: round1((b.up / b.samples) * 100),
            samples: t("monitor.samplesCount", { count: b.samples }),
          })
        : t("monitor.segNoData", { time: when });
      return `<span class="monitor-seg ${bucketClass(b)}" title="${escapeAttr(title)}"></span>`;
    }).join("");

    return `
      <section class="monitor-section">
        <h4>${escapeHtml(t("monitor.availability"))}</h4>
        <div class="monitor-bar">${segments}</div>
        <div class="monitor-axis">
          <span>${escapeHtml(formatAxisTime(d.from, d.range))}</span>
          <span>${escapeHtml(formatAxisTime(d.to, d.range))}</span>
        </div>
      </section>`;
  }

  function monitorChartHtml(d) {
    const head = `<h4>${escapeHtml(`${t("monitor.latencyChart")}, ${t("units.ms")}`)}</h4>`;
    const points = d.buckets.map((b, i) => ({ i, avg: b.avg, min: b.min, max: b.max, down: b.samples > 0 && b.up === 0 }));
    const measured = points.filter((p) => p.avg != null);
    if (!measured.length) {
      return `<section class="monitor-section">${head}<p class="monitor-placeholder">${escapeHtml(t("monitor.noData"))}</p></section>`;
    }

    const plotW = CHART.w - CHART.left - CHART.right;
    const plotH = CHART.h - CHART.top - CHART.bottom;
    const scale = niceCeil(Math.max(...measured.map((p) => p.max ?? p.avg)));
    const x = (i) => CHART.left + ((i + 0.5) * plotW) / points.length;
    const y = (v) => CHART.top + plotH * (1 - Math.min(v, scale) / scale);
    const baseline = CHART.top + plotH;
    const ticks = [scale, scale / 2, 0];

    // Runs of consecutive buckets that have data. A gap breaks the line rather
    // than being bridged by one, which would draw measurements nobody took.
    const runs = [];
    let run = null;
    for (const p of points) {
      if (p.avg == null) { run = null; continue; }
      if (!run) { run = []; runs.push(run); }
      run.push(p);
    }

    const grid = ticks.map((v) =>
      `<line class="monitor-grid" x1="${CHART.left}" x2="${CHART.w - CHART.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`
    ).join("");
    // min–max spread as a filled band: out along the maxima, back along the minima.
    const band = runs.filter((seg) => seg.length > 1 && seg.some((p) => p.max != null && p.min != null && p.max > p.min))
      .map((seg) => {
        const top = seg.map((p) => `${x(p.i).toFixed(1)},${y(p.max ?? p.avg).toFixed(1)}`);
        const bottom = seg.slice().reverse().map((p) => `${x(p.i).toFixed(1)},${y(p.min ?? p.avg).toFixed(1)}`);
        return `<polygon class="monitor-band" points="${top.concat(bottom).join(" ")}"/>`;
      }).join("");
    const lines = runs.filter((seg) => seg.length > 1)
      .map((seg) => `<polyline class="monitor-line" points="${seg.map((p) => `${x(p.i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" ")}"/>`)
      .join("");
    // A single measured bucket surrounded by gaps has no line to be part of. The
    // point is drawn twice with a round cap, which paints a dot — a <circle>
    // would be squashed into an ellipse by the horizontal stretch below.
    const dots = runs.filter((seg) => seg.length === 1)
      .map((seg) => {
        const px = x(seg[0].i).toFixed(1);
        const py = y(seg[0].avg).toFixed(1);
        return `<polyline class="monitor-dot" points="${px},${py} ${px},${py}"/>`;
      }).join("");
    // Buckets where every check failed: there is no latency to plot, so they are
    // marked under the baseline instead of silently disappearing from the chart.
    const downs = points.filter((p) => p.down)
      .map((p) => `<line class="monitor-down" x1="${x(p.i).toFixed(1)}" x2="${x(p.i).toFixed(1)}" y1="${baseline.toFixed(1)}" y2="${(baseline + 5).toFixed(1)}"/>`)
      .join("");

    // The plot is stretched horizontally to the modal width but keeps its height
    // in pixels, so the Y labels live in HTML next to it — text inside a
    // non-uniformly scaled SVG comes out with stretched glyphs.
    const yLabels = ticks.map((v) => `<span>${escapeHtml(String(round1(v)))}</span>`).join("");

    return `
      <section class="monitor-section">
        ${head}
        <div class="monitor-plot">
          <div class="monitor-yaxis" aria-hidden="true">${yLabels}</div>
          <svg class="monitor-chart" viewBox="0 0 ${CHART.w} ${CHART.h}" preserveAspectRatio="none" role="img"
               aria-label="${escapeAttr(t("monitor.latencyChart"))}">
            ${grid}${band}${lines}${dots}${downs}
          </svg>
        </div>
      </section>`;
  }

  function monitorIncidentsHtml(d) {
    const more = d.incidents_total > d.incidents.length
      ? ` <span class="monitor-hint">${escapeHtml(t("monitor.incidentsMore", { shown: d.incidents.length, total: d.incidents_total }))}</span>`
      : "";
    const head = `<h4>${escapeHtml(t("monitor.incidents"))}${more}</h4>`;
    if (!d.incidents.length) {
      const empty = d.summary.samples ? t("monitor.noIncidents") : t("monitor.empty");
      return `<section class="monitor-section">${head}<p class="monitor-placeholder">${escapeHtml(empty)}</p></section>`;
    }
    const rows = d.incidents.map((inc) => `
      <li class="monitor-incident${inc.ongoing ? " is-ongoing" : ""}">
        <span class="monitor-incident-when">${escapeHtml(formatCheckTime(inc.from))} → ${escapeHtml(inc.ongoing ? t("monitor.ongoing") : formatCheckTime(inc.to))}</span>
        <span class="monitor-incident-dur">${escapeHtml(formatDuration(inc.duration_ms))}</span>
        <span class="monitor-incident-why">${escapeHtml(reasonLabel(inc.error))}</span>
      </li>`).join("");
    return `<section class="monitor-section">${head}<ul class="monitor-incidents">${rows}</ul></section>`;
  }

  function uptimeClass(uptime) {
    if (uptime == null) return "";
    if (uptime >= 99.5) return "is-good";
    if (uptime >= 95) return "is-warn";
    return "is-bad";
  }

  // Probe failures come back as machine-readable reasons ("timeout"); anything
  // this build does not have a translation for is shown as it arrived.
  function reasonLabel(error) {
    if (!error) return "";
    // A 5xx answer is recorded as its status, which needs no dictionary entry
    // per code.
    const status = /^http_(\d{3})$/.exec(error);
    if (status) return t("monitor.reason.http", { status: status[1] });
    const key = `monitor.reason.${error}`;
    return I18N.en[key] ? t(key) : String(error);
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  // Rounds the top of the latency axis up to a readable number. The usual
  // 1/2/5 ladder is too coarse here — it turns a 220 ms peak into a 500 ms axis
  // and throws away half the plot — so the steps in between are included, all of
  // them still halving cleanly for the middle gridline.
  const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  function niceCeil(value) {
    if (!(value > 0)) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / power;
    return (NICE_STEPS.find((step) => normalized <= step) ?? 10) * power;
  }

  // Two units at most: "3 д 4 ч" is a duration, "3 д 4 ч 12 мин 6 с" is a puzzle.
  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds} ${t("units.secShort")}`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} ${t("units.minShort")}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      const rest = minutes % 60;
      return rest ? `${hours} ${t("units.hourShort")} ${rest} ${t("units.minShort")}` : `${hours} ${t("units.hourShort")}`;
    }
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return rest ? `${days} ${t("units.dayShort")} ${rest} ${t("units.hourShort")}` : `${days} ${t("units.dayShort")}`;
  }

  // Today's checks only need a clock; anything older needs the date to be useful.
  function formatCheckTime(ts) {
    if (!Number.isFinite(ts)) return "—";
    const date = new Date(ts);
    const options = new Date().toDateString() === date.toDateString()
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
    return new Intl.DateTimeFormat(locale(), options).format(date);
  }

  // Only the two sub-day ranges get a bare clock. A one-day window starts and
  // ends at nearly the same time of day, so without the date the two ends of the
  // axis read as the same moment.
  function formatAxisTime(ts, range) {
    const options = range === "1h" || range === "6h"
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
    return new Intl.DateTimeFormat(locale(), options).format(new Date(ts));
  }

  function formatBucketTime(start, bucketMs) {
    const startText = new Intl.DateTimeFormat(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(start));
    const endText = new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(start + bucketMs));
    return `${startText} – ${endText}`;
  }

  el("monitorRanges").addEventListener("click", (e) => {
    const range = e.target.closest("[data-range]")?.dataset.range;
    if (!range || range === state.monitor.range) return;
    state.monitor.range = range;
    // Repaint the pills at once so the click feels answered, then fetch.
    renderMonitor();
    loadMonitor();
  });

  el("monitorRecheckBtn").addEventListener("click", async () => {
    const btn = el("monitorRecheckBtn");
    if (state.monitor.itemId == null || btn.disabled) return;
    const itemId = state.monitor.itemId;
    btn.disabled = true;
    btn.textContent = t("monitor.checking");
    try {
      await api(`/items/${itemId}/recheck`, { method: "POST" });
      // The check just ran, so the card's dot and the window are both out of date.
      refreshHealthOnly();
      await loadMonitor({ silent: true });
    } catch (err) {
      state.monitor.error = err?.message || t("error.generic");
      renderMonitor();
    } finally {
      btn.disabled = false;
      btn.textContent = t("monitor.recheck");
    }
  });

  el("monitorXBtn").addEventListener("click", closeMonitorModal);
  el("monitorCloseBtn").addEventListener("click", closeMonitorModal);

  // ---------- Sticky Note (v29) ----------
  // A free-floating to-do pad, and the only widget the user can place anywhere
  // on the screen. Both of its states live in the same element — a collapsed
  // button showing just the sticky glyph, and an expanded panel — so a drag
  // moves the same node either way.
  //
  // The content is a list of lines rather than one rich-text blob: a line is
  // plain text, a bullet or a checkbox, which keeps "tick the box" a data change
  // instead of a DOM-parsing exercise, while emphasis (bold/italic/underline)
  // stays inline inside a line. While the note is on screen the DOM is the
  // source of truth; the settings row is written from it, debounced.
  const STICKY_LINE_TYPES = ["text", "bullet", "todo"];
  // Only inline emphasis survives a paste or a contenteditable quirk. Anything
  // else is unwrapped to its text, so a line can never grow structure the model
  // does not describe.
  const STICKY_ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR"]);
  // These are dropped whole rather than unwrapped: their text is markup, not
  // content, so keeping it would leak a <script> body into the note as text.
  const STICKY_DROPPED_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED"]);
  const STICKY_SAVE_DELAY = 600;
  const STICKY_DRAG_THRESHOLD = 4;
  const STICKY_CLICK_GRACE_MS = 300;
  const STICKY_EDGE_GAP = 8;

  // The serialized list the DOM is currently showing. Every save echoes the new
  // settings back through applySettingsToUI(), and rebuilding the rows on that
  // echo would drop the caret mid-word — so a rebuild only happens when the
  // stored value differs from what was last rendered.
  let stickyRendered = null;
  let stickySaveTimer = null;
  let stickyLastRow = null;
  let stickyDrag = null;
  let stickyDragEndedAt = -Infinity;

  function stickySanitize(html) {
    // Parsed into an inert document, never into a live element: assigning
    // innerHTML on a live node creates the elements first, and an
    // `<img src=x onerror=...>` runs its handler before anything gets stripped.
    // A DOMParser document has no browsing context, so nothing loads and no
    // handler ever fires.
    const host = new DOMParser().parseFromString(String(html || ""), "text/html").body;
    (function strip(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) continue;
        if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }
        if (STICKY_DROPPED_TAGS.has(child.tagName)) { child.remove(); continue; }
        strip(child);
        if (!STICKY_ALLOWED_TAGS.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      }
    })(host);
    const clean = host.innerHTML.trim();
    // A contenteditable that has been emptied often keeps a trailing <br>; it is
    // not content, and storing it would defeat the blank-line placeholder.
    return clean === "<br>" ? "" : clean;
  }

  function parseStickyLines(raw) {
    let parsed;
    try { parsed = JSON.parse(raw || "[]"); } catch (_) { return []; }
    if (!Array.isArray(parsed)) return [];
    return parsed.map((line) => ({
      type: STICKY_LINE_TYPES.includes(line?.type) ? line.type : "text",
      done: line?.done === true,
      html: String(line?.html ?? ""),
    }));
  }

  function stickyRowHtml(line) {
    const type = STICKY_LINE_TYPES.includes(line.type) ? line.type : "text";
    const done = type === "todo" && line.done === true;
    const mark = type === "todo"
      ? `<input type="checkbox" class="sticky-check"${done ? " checked" : ""}>`
      : type === "bullet" ? `<span class="sticky-bullet" aria-hidden="true">•</span>` : "";
    const remove = escapeAttr(t("sticky.removeLine"));
    return `<div class="sticky-line" data-type="${type}" data-done="${done}"` +
      `>${mark}<div class="sticky-text" contenteditable="true" role="textbox" data-placeholder="${escapeAttr(t("sticky.placeholder"))}">${stickySanitize(line.html)}</div>` +
      `<button type="button" class="sticky-line-del" data-i18n-title="sticky.removeLine" data-i18n-aria="sticky.removeLine" title="${remove}" aria-label="${remove}">×</button></div>`;
  }

  function collectStickyLines() {
    return [...document.querySelectorAll("#stickyLines .sticky-line")].map((row) => ({
      type: STICKY_LINE_TYPES.includes(row.dataset.type) ? row.dataset.type : "text",
      done: row.dataset.type === "todo" && row.querySelector(".sticky-check")?.checked === true,
      html: stickySanitize(row.querySelector(".sticky-text")?.innerHTML || ""),
    }));
  }

  // Drives the per-line placeholder. :empty cannot do this job — a browser is
  // free to leave a <br> behind in an emptied contenteditable.
  function stickySyncBlank(row) {
    const text = row?.querySelector(".sticky-text");
    if (text) row.dataset.blank = text.textContent.trim() ? "false" : "true";
  }

  function stickyInsertRow(afterRow, line) {
    const host = el("stickyLines");
    if (!host) return null;
    const holder = document.createElement("div");
    holder.innerHTML = stickyRowHtml(line);
    const row = holder.firstElementChild;
    if (afterRow && afterRow.parentNode === host) afterRow.after(row);
    else host.appendChild(row);
    stickySyncBlank(row);
    return row;
  }

  function focusStickyLine(row, where) {
    const text = row?.querySelector(".sticky-text");
    if (!text) return;
    text.focus();
    const range = document.createRange();
    range.selectNodeContents(text);
    range.collapse(where === "start");
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    stickyLastRow = row;
  }

  function stickyTargetRow() {
    const host = el("stickyLines");
    if (!host) return null;
    if (stickyLastRow && stickyLastRow.isConnected) return stickyLastRow;
    return host.lastElementChild;
  }

  function renderStickyLines(lines) {
    const host = el("stickyLines");
    if (!host) return;
    // An empty note still offers one line to type into. It is not persisted
    // until the user actually puts something in it.
    const list = lines.length ? lines : [{ type: "todo", done: false, html: "" }];
    host.innerHTML = list.map(stickyRowHtml).join("");
    [...host.children].forEach(stickySyncBlank);
    stickyLastRow = null;
  }

  function queueStickySave(delay = STICKY_SAVE_DELAY) {
    clearTimeout(stickySaveTimer);
    stickySaveTimer = setTimeout(saveStickyLines, delay);
  }

  async function saveStickyLines() {
    clearTimeout(stickySaveTimer);
    const raw = JSON.stringify(collectStickyLines());
    if (raw === stickyRendered) return;
    const previous = stickyRendered;
    stickyRendered = raw;
    try {
      await saveSettingsField("widget_sticky_lines", raw);
    } catch (_) {
      // Keep what the user typed on screen and let the next edit try again.
      stickyRendered = previous;
    }
  }

  function applyStickyFormat(command) {
    const host = el("stickyLines");
    if (!host) return;
    const selection = window.getSelection();
    const inside = selection && selection.rangeCount > 0 && host.contains(selection.anchorNode);
    if (!inside) focusStickyLine(stickyTargetRow(), "end");
    // execCommand is the only cross-browser way to toggle inline emphasis in a
    // contenteditable; on a collapsed selection it arms the style for whatever
    // is typed next, which is exactly what a toolbar button should do.
    document.execCommand(command);
    queueStickySave(0);
  }

  function setStickyLineType(type) {
    const row = stickyTargetRow();
    if (!row) return;
    const html = row.querySelector(".sticky-text")?.innerHTML || "";
    const replacement = stickyInsertRow(row, { type, done: false, html });
    row.remove();
    focusStickyLine(replacement, "end");
    queueStickySave(0);
  }

  function clampStickyPx(px, size, extent) {
    const max = Math.max(STICKY_EDGE_GAP, extent - size - STICKY_EDGE_GAP);
    return Math.min(Math.max(px, STICKY_EDGE_GAP), max);
  }

  function positionStickyNote() {
    const note = el("stickyNote");
    if (!note || note.hidden) return;
    const s = state.settings || {};
    const w = note.offsetWidth;
    const h = note.offsetHeight;
    const fx = Number(s.widget_sticky_x);
    const fy = Number(s.widget_sticky_y);
    const placed = String(s.widget_sticky_x ?? "") !== "" && String(s.widget_sticky_y ?? "") !== "" &&
      Number.isFinite(fx) && Number.isFinite(fy);
    // Never placed: the note opens below the toolbar on the right, clear of the
    // widget stack on the left and of the ping dock at the bottom.
    const x = placed ? fx * window.innerWidth : window.innerWidth - w - 26;
    const y = placed ? fy * window.innerHeight : 92;
    note.style.left = `${clampStickyPx(x, w, window.innerWidth)}px`;
    note.style.top = `${clampStickyPx(y, h, window.innerHeight)}px`;
  }

  function applyStickyNoteState() {
    const note = el("stickyNote");
    if (!note) return;
    const s = state.settings || {};
    const on = s.widget_sticky_enabled === "true";
    note.hidden = !on;
    if (!on) return;
    note.dataset.state = s.widget_sticky_collapsed === "true" ? "collapsed" : "expanded";
    const raw = String(s.widget_sticky_lines ?? "[]");
    if (raw !== stickyRendered) {
      stickyRendered = raw;
      renderStickyLines(parseStickyLines(raw));
    }
    const placeholder = t("sticky.placeholder");
    note.querySelectorAll(".sticky-text").forEach((n) => { n.dataset.placeholder = placeholder; });
    positionStickyNote();
  }

  async function setStickyCollapsed(collapsed) {
    // Collapsing hides the editor, so the pending text goes out in the same PUT
    // as the new state — a reload can never show the old note in a new state.
    clearTimeout(stickySaveTimer);
    const lines = JSON.stringify(collectStickyLines());
    stickyRendered = lines;
    await saveSettingsFields({ widget_sticky_collapsed: collapsed, widget_sticky_lines: lines });
  }

  // ---------- Sticky Note: free-form dragging ----------
  function armStickyDrag(e) {
    if (stickyDrag || (e.pointerType === "mouse" && e.button !== 0)) return;
    const note = el("stickyNote");
    if (!note || note.hidden) return;
    const rect = note.getBoundingClientRect();
    stickyDrag = {
      pointerId: e.pointerId, active: false,
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - rect.left, offY: e.clientY - rect.top,
    };
    window.addEventListener("pointermove", onStickyPointerMove, { passive: false });
    window.addEventListener("pointerup", onStickyPointerUp);
    window.addEventListener("pointercancel", onStickyPointerUp);
  }

  function onStickyPointerMove(e) {
    if (!stickyDrag || e.pointerId !== stickyDrag.pointerId) return;
    const note = el("stickyNote");
    if (!note) return;
    if (!stickyDrag.active) {
      if (Math.abs(e.clientX - stickyDrag.startX) < STICKY_DRAG_THRESHOLD &&
          Math.abs(e.clientY - stickyDrag.startY) < STICKY_DRAG_THRESHOLD) return;
      stickyDrag.active = true;
      note.classList.add("sticky-dragging");
      document.body.classList.add("dragging-sticky");
    }
    e.preventDefault();
    note.style.left = `${clampStickyPx(e.clientX - stickyDrag.offX, note.offsetWidth, window.innerWidth)}px`;
    note.style.top = `${clampStickyPx(e.clientY - stickyDrag.offY, note.offsetHeight, window.innerHeight)}px`;
  }

  function onStickyPointerUp(e) {
    if (!stickyDrag || e.pointerId !== stickyDrag.pointerId) return;
    window.removeEventListener("pointermove", onStickyPointerMove);
    window.removeEventListener("pointerup", onStickyPointerUp);
    window.removeEventListener("pointercancel", onStickyPointerUp);
    const moved = stickyDrag.active;
    stickyDrag = null;
    el("stickyNote")?.classList.remove("sticky-dragging");
    document.body.classList.remove("dragging-sticky");
    if (!moved) return;
    // A drag that ends over the collapsed button must not also count as a tap
    // that expands the note.
    stickyDragEndedAt = performance.now();
    saveStickyPosition();
  }

  function saveStickyPosition() {
    const note = el("stickyNote");
    if (!note) return;
    const rect = note.getBoundingClientRect();
    // Stored as a fraction of the viewport, so the note keeps its spot on a
    // window (or screen) of a different size.
    const round = (v) => Math.round(v * 10000) / 10000;
    saveSettingsFields({
      widget_sticky_x: round(window.innerWidth ? rect.left / window.innerWidth : 0),
      widget_sticky_y: round(window.innerHeight ? rect.top / window.innerHeight : 0),
    });
  }

  // ---------- Sticky Note: bindings ----------
  el("stickyHead")?.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    armStickyDrag(e);
  });
  el("stickyExpandBtn")?.addEventListener("pointerdown", armStickyDrag);
  el("stickyExpandBtn")?.addEventListener("click", () => {
    if (performance.now() - stickyDragEndedAt < STICKY_CLICK_GRACE_MS) return;
    setStickyCollapsed(false);
  });
  el("stickyCollapseBtn")?.addEventListener("click", () => setStickyCollapsed(true));
  el("stickyAddBtn")?.addEventListener("click", () => {
    const row = stickyInsertRow(null, { type: "todo", done: false, html: "" });
    focusStickyLine(row, "start");
  });

  el("stickyNote")?.querySelectorAll(".sticky-tool").forEach((btn) => {
    // The selection is lost the moment the editor blurs, so the button has to
    // refuse focus rather than take it and hand it back.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      if (btn.dataset.format) applyStickyFormat(btn.dataset.format);
      else if (btn.dataset.lineType) setStickyLineType(btn.dataset.lineType);
    });
  });

  el("stickyLines")?.addEventListener("focusin", (e) => {
    const row = e.target.closest(".sticky-line");
    if (row) stickyLastRow = row;
  });
  el("stickyLines")?.addEventListener("focusout", () => queueStickySave(0));
  el("stickyLines")?.addEventListener("input", (e) => {
    const text = e.target.closest(".sticky-text");
    if (!text) return;
    stickySyncBlank(text.closest(".sticky-line"));
    queueStickySave();
  });
  el("stickyLines")?.addEventListener("change", (e) => {
    const check = e.target.closest(".sticky-check");
    if (!check) return;
    check.closest(".sticky-line").dataset.done = check.checked ? "true" : "false";
    queueStickySave(0);
  });
  el("stickyLines")?.addEventListener("click", (e) => {
    const remove = e.target.closest(".sticky-line-del");
    if (!remove) return;
    const row = remove.closest(".sticky-line");
    const neighbour = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    if (!el("stickyLines").children.length) stickyInsertRow(null, { type: "todo", done: false, html: "" });
    if (neighbour) focusStickyLine(neighbour, "end");
    queueStickySave(0);
  });

  el("stickyLines")?.addEventListener("keydown", (e) => {
    const text = e.target.closest(".sticky-text");
    if (!text) return;
    const row = text.closest(".sticky-line");
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      focusStickyLine(stickyInsertRow(row, { type: row.dataset.type, done: false, html: "" }), "start");
      queueStickySave(0);
      return;
    }
    if (e.key === "Backspace" && !text.textContent.trim() && el("stickyLines").children.length > 1) {
      e.preventDefault();
      const previous = row.previousElementSibling;
      row.remove();
      if (previous) focusStickyLine(previous, "end");
      queueStickySave(0);
      return;
    }
    if (e.key === "Escape") {
      // Handled here so the global Escape does not also close something behind
      // the note.
      e.preventDefault();
      e.stopPropagation();
      text.blur();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
      // The browser applies the shortcut itself; this only makes sure the result
      // is written back.
      queueStickySave();
    }
  });

  el("stickyLines")?.addEventListener("paste", (e) => {
    const text = e.target.closest(".sticky-text");
    if (!text) return;
    e.preventDefault();
    const raw = (e.clipboardData || window.clipboardData)?.getData("text/plain") || "";
    const parts = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 1) {
      document.execCommand("insertText", false, raw.replace(/\s*\r?\n\s*/g, " "));
    } else {
      // A pasted list becomes a list: one line per line, same kind as the line
      // it was pasted into.
      const row = text.closest(".sticky-line");
      document.execCommand("insertText", false, parts[0]);
      let anchor = row;
      for (const part of parts.slice(1)) {
        anchor = stickyInsertRow(anchor, { type: row.dataset.type, done: false, html: escapeHtml(part) });
      }
      focusStickyLine(anchor, "end");
    }
    stickySyncBlank(text.closest(".sticky-line"));
    queueStickySave(0);
  });

  window.addEventListener("resize", positionStickyNote);

  // ---------- Network speed (v30) ----------
  // The panel is the Sticky Note's shell without the free-form position: this one
  // is pinned to the bottom-left corner, so the only state worth storing is
  // enabled/collapsed plus the chosen server. Every number on screen comes from
  // one POST — the browser is not allowed to time a third-party download, so the
  // backend does the measuring and reports bits per second.
  const SPEED_AUTO = "auto";

  function speedServerOptions() {
    // Mirrors SPEED_SERVERS in app/src/speedtest.js. The ids travel to the
    // backend; the labels are local, because "Auto" is a word and not a host.
    return [
      { id: SPEED_AUTO, label: t("speed.auto") },
      { id: "cloudflare", label: "Cloudflare" },
      { id: "hetzner", label: "Hetzner (DE)" },
      { id: "hetzner_us", label: "Hetzner (US)" },
      { id: "ovh", label: "OVH (FR)" },
    ];
  }

  function populateSpeedServers() {
    const select = el("speedServer");
    if (!select) return;
    const want = state.settings.widget_speed_server || SPEED_AUTO;
    const options = speedServerOptions();
    select.innerHTML = options
      .map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`)
      .join("");
    select.value = options.some((o) => o.id === want) ? want : SPEED_AUTO;
  }

  function formatSpeed(bitsPerSecond) {
    if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return "—";
    const mbps = bitsPerSecond / 1e6;
    // Below 100 Mbit/s one decimal is information; above it, it is noise.
    return `${mbps >= 100 ? Math.round(mbps) : mbps.toFixed(1)} ${t("units.mbps")}`;
  }

  function formatLatency(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ${t("units.ms")}`;
  }

  function renderSpeedResult() {
    if (!el("speedStatus")) return;
    const result = state.speed.data;
    el("speedDownload").textContent = result ? formatSpeed(result.download) : "—";
    el("speedUpload").textContent = result ? formatSpeed(result.upload) : "—";
    el("speedLatency").textContent = result ? formatLatency(result.latency) : "—";

    const status = el("speedStatus");
    if (state.speed.loading) setSpeedStatus("speed.running");
    else if (state.speed.error) setSpeedStatus("speed.failed");
    else if (!result) setSpeedStatus("speed.idle");
    else if (!Number.isFinite(result.upload) || result.upload <= 0) setSpeedStatus("speed.noUpload", { server: result.server });
    else setSpeedStatus("speed.doneVia", { server: result.server });
    status.classList.toggle("is-error", Boolean(state.speed.error) && !state.speed.loading);
  }

  // The key is kept on the node so a language switch re-renders the line through
  // the same path as every other translated string. A line with a value in it
  // cannot be re-derived that way, so it drops the key and waits for the next
  // renderSpeedResult() instead.
  function setSpeedStatus(key, vars) {
    const status = el("speedStatus");
    if (!status) return;
    if (vars) delete status.dataset.i18n;
    else status.dataset.i18n = key;
    status.textContent = t(key, vars);
  }

  function applySpeedWidgetState() {
    const widget = el("speedWidget");
    if (!widget) return;
    const s = state.settings || {};
    const on = s.widget_speed_enabled === "true";
    widget.hidden = !on;
    if (!on) return;
    widget.dataset.state = s.widget_speed_collapsed === "false" ? "expanded" : "collapsed";
    populateSpeedServers();
    renderSpeedResult();
  }

  async function runSpeedTest() {
    if (state.speed.loading) return;
    state.speed.loading = true;
    state.speed.error = null;
    el("speedRunBtn").disabled = true;
    renderSpeedResult();
    try {
      const server = el("speedServer")?.value || SPEED_AUTO;
      state.speed.data = await api("/speedtest", {
        method: "POST",
        body: JSON.stringify({ server }),
      });
    } catch (err) {
      state.speed.error = err.message || t("error.unknown");
    } finally {
      state.speed.loading = false;
      el("speedRunBtn").disabled = false;
      renderSpeedResult();
    }
  }

  el("speedExpandBtn")?.addEventListener("click", () => {
    saveSettingsField("widget_speed_collapsed", false);
  });
  el("speedCollapseBtn")?.addEventListener("click", () => {
    saveSettingsField("widget_speed_collapsed", true);
  });
  el("speedServer")?.addEventListener("change", (e) => {
    saveSettingsField("widget_speed_server", e.target.value);
  });
  el("speedRunBtn")?.addEventListener("click", runSpeedTest);

  // ---------- Widget context menu + settings popover ----------
  // Per the spec: widgets cannot be moved or repositioned. All widget
  // configuration (beyond the simple show/hide toggles in general settings)
  // happens through a right-click on the widget itself: first a small
  // context menu (Редактировать / Удалить), then a settings popover that
  // opens to the right of the cursor.
  const WIDGET_TITLE_KEYS = { date: "widget.date", time: "widget.time", weather: "widget.weather", ping: "widget.ping" };
  const WIDGET_ENABLED_KEY = { date: "widget_date_enabled", time: "widget_time_enabled", weather: "widget_weather_enabled", ping: "widget_ping_enabled" };

  // Built per call, not once at load, so the popover follows the current language.
  const widgetStyleOptions = () => `<option value="card">${escapeHtml(t("style.card"))}</option><option value="minimal">${escapeHtml(t("style.minimal"))}</option><option value="glass">${escapeHtml(t("style.glass"))}</option>`;

  const WIDGET_POPOVER_FIELDS = {
    date: () => `
      <label class="field">${escapeHtml(t("widget.format"))}<select id="setDateFormat"><option value="full">${escapeHtml(t("date.full"))}</option><option value="short">${escapeHtml(t("date.short"))}</option><option value="numeric">${escapeHtml(t("date.numeric"))}</option></select></label>
      <label class="field">${escapeHtml(t("widget.style"))}<select id="setDateStyle">${widgetStyleOptions()}</select></label>
      <label class="field">${escapeHtml(t("widget.fontSize"))}<input type="number" id="setDateFontSize" min="10" max="64"></label>
    `,
    time: () => `
      <label class="field-inline"><input type="checkbox" id="setTimeSeconds"> ${escapeHtml(t("widget.showSeconds"))}</label>
      <label class="field">${escapeHtml(t("widget.style"))}<select id="setTimeStyle">${widgetStyleOptions()}</select></label>
      <label class="field">${escapeHtml(t("widget.fontSize"))}<input type="number" id="setTimeFontSize" min="10" max="64"></label>
    `,
    weather: () => `
      <label class="field">${escapeHtml(t("widget.place"))}<select id="setWeatherLocationMode"><option value="auto">${escapeHtml(t("place.auto"))}</option><option value="city">${escapeHtml(t("place.city"))}</option></select></label>
      <label class="field">${escapeHtml(t("widget.city"))}<input type="text" id="setWeatherCity" placeholder="${escapeAttr(t("widget.city.ph"))}"></label>
      <div class="field-row">
        <label class="field">${escapeHtml(t("widget.units"))}<select id="setWeatherUnits"><option value="metric">°C</option><option value="imperial">°F</option></select></label>
        <label class="field">${escapeHtml(t("widget.style"))}<select id="setWeatherStyle">${widgetStyleOptions()}</select></label>
      </div>
      <label class="field">${escapeHtml(t("widget.fontSize"))}<input type="number" id="setWeatherFontSize" min="10" max="64"></label>
    `,
    ping: () => `
      <label class="field">${escapeHtml(t("widget.format"))}<select id="setPingFormat"><option value="full">${escapeHtml(t("ping.format.full"))}</option><option value="name">${escapeHtml(t("ping.format.name"))}</option><option value="latency">${escapeHtml(t("ping.format.latency"))}</option></select></label>
      <div class="ping-host-fields">
        <div class="ping-host-row"><input type="text" id="setPingName1" placeholder="${escapeAttr(t("ping.hostName.ph"))}"><input type="text" id="setPingHost1" placeholder="192.168.1.1"></div>
        <div class="ping-host-row"><input type="text" id="setPingName2" placeholder="${escapeAttr(t("ping.hostName.ph"))}"><input type="text" id="setPingHost2" placeholder="192.168.1.2"></div>
        <div class="ping-host-row"><input type="text" id="setPingName3" placeholder="${escapeAttr(t("ping.hostName.ph"))}"><input type="text" id="setPingHost3" placeholder="8.8.8.8"></div>
        <div class="ping-host-row"><input type="text" id="setPingName4" placeholder="${escapeAttr(t("ping.hostName.ph"))}"><input type="text" id="setPingHost4" placeholder="1.1.1.1"></div>
      </div>
      <div class="field-row">
        <label class="field">${escapeHtml(t("ping.interval"))}<input type="number" id="setPingInterval" min="3" max="300"></label>
        <label class="field">${escapeHtml(t("ping.method"))}<select id="setPingMethod"><option value="icmp">ICMP (ping)</option><option value="tcp">TCP (port)</option></select></label>
      </div>
      <div class="hint">${escapeHtml(t("ping.hint"))}</div>
    `,
  };

  const WIDGET_FIELD_MAP = {
    date: { setDateFormat: "widget_date_format", setDateStyle: "widget_date_style", setDateFontSize: "widget_date_font_size" },
    time: { setTimeSeconds: "widget_time_seconds", setTimeStyle: "widget_time_style", setTimeFontSize: "widget_time_font_size" },
    weather: { setWeatherLocationMode: "widget_weather_location_mode", setWeatherCity: "widget_weather_city", setWeatherUnits: "widget_weather_units", setWeatherStyle: "widget_weather_style", setWeatherFontSize: "widget_weather_font_size" },
    ping: { setPingFormat: "widget_ping_format", setPingInterval: "widget_ping_interval", setPingMethod: "widget_ping_method" },
  };

  function fillWidgetPopoverValues(key) {
    const s = state.settings;
    if (key === "date") {
      el("setDateFormat").value = s.widget_date_format || WIDGET_DATE_FORMAT_DEFAULT;
      el("setDateStyle").value = s.widget_date_style || "card";
      el("setDateFontSize").value = s.widget_date_font_size || String(WIDGET_FONT_SIZE_DEFAULT);
    } else if (key === "time") {
      el("setTimeSeconds").checked = s.widget_time_seconds === "true";
      el("setTimeStyle").value = s.widget_time_style || "card";
      el("setTimeFontSize").value = s.widget_time_font_size || String(WIDGET_FONT_SIZE_DEFAULT);
    } else if (key === "weather") {
      el("setWeatherLocationMode").value = s.widget_weather_location_mode || "auto";
      el("setWeatherCity").value = s.widget_weather_city || "";
      el("setWeatherUnits").value = s.widget_weather_units || "metric";
      el("setWeatherStyle").value = s.widget_weather_style || "card";
      el("setWeatherFontSize").value = s.widget_weather_font_size || String(WIDGET_FONT_SIZE_DEFAULT);
      updateWeatherCityState();
    } else if (key === "ping") {
      el("setPingFormat").value = s.widget_ping_format || "full";
      el("setPingInterval").value = s.widget_ping_interval || "10";
      el("setPingMethod").value = s.widget_ping_method || "icmp";
      const pingResources = getPingResources();
      [1, 2, 3, 4].forEach((i) => {
        el(`setPingName${i}`).value = pingResources[i - 1]?.name || "";
        el(`setPingHost${i}`).value = pingResources[i - 1]?.host || "";
      });
    }
  }

  function bindWidgetPopoverEvents(key) {
    const map = WIDGET_FIELD_MAP[key] || {};
    Object.entries(map).forEach(([id, settingKey]) => {
      const node = el(id);
      if (!node) return;
      node.addEventListener("change", async (e) => {
        await saveSettingsField(settingKey, e.target.type === "checkbox" ? e.target.checked : e.target.value);
        if (settingKey === "widget_weather_location_mode") updateWeatherCityState();
        if (["widget_weather_location_mode", "widget_weather_city", "widget_weather_units"].includes(settingKey)) {
          state.weather.data = null; state.weather.error = null; clearTimeout(weatherRefreshTimer);
        }
        if (settingKey === "widget_ping_interval" || settingKey === "widget_ping_method") {
          state.ping.data = [];
          stopPingRefresh();
        }
        renderWidgets();
      });
    });
    if (key === "ping") {
      [1, 2, 3, 4].forEach((i) => ["setPingName" + i, "setPingHost" + i].forEach((id) => {
        el(id)?.addEventListener("change", async () => {
          const resources = [1, 2, 3, 4]
            .map((n) => ({ name: el(`setPingName${n}`).value.trim(), host: el(`setPingHost${n}`).value.trim() }))
            .filter((r) => r.host);
          await saveSettingsField("widget_ping_hosts", JSON.stringify(resources));
          state.ping.data = [];
          stopPingRefresh();
          renderWidgets();
        });
      }));
    }
  }

  function positionPopover(pop, x, y) {
    pop.style.left = "-9999px";
    pop.style.top = "-9999px";
    pop.hidden = false;
    const rect = pop.getBoundingClientRect();
    let left = x + 10;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, x - rect.width - 10);
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - rect.width - 8);
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - rect.height - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function openWidgetPopover(key, x, y) {
    const pop = el("widgetPopover");
    if (!pop || !WIDGET_POPOVER_FIELDS[key]) return;
    el("widgetPopoverTitle").textContent = t("widget.settingsTitle", { title: t(WIDGET_TITLE_KEYS[key]) });
    el("widgetPopoverBody").innerHTML = WIDGET_POPOVER_FIELDS[key]();
    fillWidgetPopoverValues(key);
    bindWidgetPopoverEvents(key);
    positionPopover(pop, x, y);
  }

  function closeWidgetPopover() { const pop = el("widgetPopover"); if (pop) pop.hidden = true; }
  el("widgetPopoverClose")?.addEventListener("click", closeWidgetPopover);

  let widgetContextKey = null;
  function showWidgetContextMenu(x, y, key) {
    widgetContextKey = key;
    const menu = el("widgetContextMenu");
    menu.dataset.clickX = x;
    menu.dataset.clickY = y;
    menu.hidden = false;
    menu.style.left = Math.min(x, window.innerWidth - 190) + "px";
    menu.style.top = Math.min(y, window.innerHeight - 90) + "px";
  }
  function hideWidgetContextMenu() { const menu = el("widgetContextMenu"); if (menu) menu.hidden = true; widgetContextKey = null; }

  el("widgetContextMenu")?.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    const menu = el("widgetContextMenu");
    if (!action || !widgetContextKey) return;
    const key = widgetContextKey;
    const x = Number(menu.dataset.clickX || 0), y = Number(menu.dataset.clickY || 0);
    hideWidgetContextMenu();
    if (action === "edit") openWidgetPopover(key, x, y);
    if (action === "delete") { await saveSettingsField(WIDGET_ENABLED_KEY[key], false); renderWidgets(); }
  });

  ["date", "time", "weather"].forEach((key) => {
    el(`${key}Widget`)?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      closeWidgetPopover();
      showWidgetContextMenu(e.clientX, e.clientY, key);
    });
  });
  el("pingWidget")?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    closeWidgetPopover();
    showWidgetContextMenu(e.clientX, e.clientY, "ping");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#widgetContextMenu") && !e.target.closest(".widget")) hideWidgetContextMenu();
    if (!e.target.closest("#widgetPopover") && !e.target.closest(".widget") && !e.target.closest("#widgetContextMenu")) closeWidgetPopover();
  });

  // ---------- Confirm modal ----------
  // Raised above every other overlay in CSS, because the questions it asks come
  // from inside other dialogs (deleting a category from the settings modal).
  let confirmCallback = null;
  function showConfirm(text, cb) {
    el("confirmText").textContent = text;
    confirmCallback = cb;
    el("confirmModal").hidden = false;
    el("confirmOkBtn").focus();
  }
  // Any dismissal drops the callback, so a later "Удалить" cannot fire the
  // question the user just walked away from.
  function closeConfirm() { el("confirmModal").hidden = true; confirmCallback = null; }
  el("confirmCancelBtn").addEventListener("click", closeConfirm);
  el("confirmOkBtn").addEventListener("click", async () => {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) await cb();
  });

  // ---------- Item add/edit modal ----------
  function populateCategorySelect(selectedId) {
    const sel = el("itemCategory");
    sel.innerHTML = `<option value="">${escapeHtml(t("category.none"))}</option>` +
      state.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    sel.value = selectedId || "";
  }

  // The three display modes are mutually exclusive: an item lives either in the
  // main grid, on the favorites shelf, or in its category block.
  const DISPLAY_MODES = ["grid", "favorite", "block"];
  function displayMode(item) {
    const mode = item?.display_mode;
    if (DISPLAY_MODES.includes(mode)) return mode;
    return item?.is_favorite ? "favorite" : "grid";
  }

  // Both selects carry an explanatory line, because neither the block mode nor
  // the non-HTTP probes are self-evident from the option label alone.
  function syncItemModalHints() {
    const displayHint = el("itemDisplayHint");
    if (displayHint) {
      const mode = el("itemDisplayMode").value;
      const text =
        mode !== "block" ? "" : el("itemCategory").value ? t("hint.displayBlock") : t("hint.displayBlockNone");
      displayHint.textContent = text;
      displayHint.hidden = !text;
    }
    const checkHint = el("itemCheckTypeHint");
    if (checkHint) {
      const type = el("itemHealthCheckType").value;
      const text = type === "tcp" ? t("hint.checkTcp") : type === "icmp" ? t("hint.checkIcmp") : "";
      checkHint.textContent = text;
      checkHint.hidden = !text;
    }
    // The swatch only has something to paint while this card forces the plate on:
    // "Как в настройках" and "Выключен" both leave the colour unused.
    const bgMode = el("itemIconBgMode");
    const bgColor = el("itemIconBgColor");
    if (bgMode && bgColor) {
      bgColor.disabled = bgMode.value !== "on";
      const hint = el("itemIconBgHint");
      if (hint) {
        const text = bgMode.value === "inherit"
          ? t(cardIconPlain() ? "hint.iconBgInheritOff" : "hint.iconBgInheritOn")
          : "";
        hint.textContent = text;
        hint.hidden = !text;
      }
    }
  }

  function openItemModal(item) {
    el("itemModalTitle").textContent = item ? t("item.modal.edit") : t("item.modal.new");
    el("itemId").value = item ? item.id : "";
    el("itemName").value = item ? item.name : "";
    el("itemUrl").value = item ? item.url : "";
    el("itemIcon").value = item ? (item.icon || "") : "";
    el("iconSearchInput").value = item ? (item.name || "") : "";
    el("iconSearchHint").textContent = t("icons.source", { format: iconFormatLabel(iconSearchFormat()) });
    el("iconSearchResults").hidden = true;
    el("iconSearchResults").innerHTML = "";
    state.dashboardIcons.results = [];
    state.siteIcon = { applied: "", checked: "" };
    setSiteIconHint("");
    syncIconFormatSwitch();
    el("itemDisplayMode").value = displayMode(item);
    el("itemIconBgMode").value = ["inherit", "on", "off"].includes(item?.icon_background_mode)
      ? item.icon_background_mode
      : "inherit";
    // A card that inherits has no colour of its own yet, so the swatch opens on
    // the global one — turning the override on then keeps the current look.
    el("itemIconBgColor").value = item?.icon_background_mode === "on"
      ? normalizeColor(item.icon_background_color, iconBackgroundColor())
      : iconBackgroundColor();
    el("itemHealthCheck").checked = item ? item.health_check_enabled : true;
    el("itemHealthCheckType").value = item && ["http", "tcp", "icmp"].includes(item.health_check_type)
      ? item.health_check_type
      : "http";
    el("itemType").value = item?.type === "bookmark" ? "bookmark" : "service";
    populateCategorySelect(item ? item.category_id : "");
    syncItemModalHints();
    el("itemModal").hidden = false;
    el("itemName").focus();
  }

  el("itemDisplayMode").addEventListener("change", syncItemModalHints);
  el("itemHealthCheckType").addEventListener("change", syncItemModalHints);
  el("itemCategory").addEventListener("change", syncItemModalHints);
  el("itemIconBgMode").addEventListener("change", syncItemModalHints);

  el("addBtn").addEventListener("click", () => openItemModal(null));
  el("itemCancelBtn").addEventListener("click", () => { el("itemModal").hidden = true; });

  el("iconSearchBtn").addEventListener("click", () => searchDashboardIcons(el("iconSearchInput").value.trim()));
  el("iconSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); searchDashboardIcons(e.target.value.trim()); }
  });
  el("iconFormatSwitch")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-icon-format]");
    if (!btn) return;
    const format = btn.dataset.iconFormat;
    if (!DASHBOARD_ICON_FORMATS.includes(format) || format === iconSearchFormat()) return;
    try {
      await saveSettingsField("icon_search_format", format);
    } catch (_) {
      // Keep the picker usable even if the preference could not be persisted.
      state.settings.icon_search_format = format;
      syncIconFormatSwitch();
    }
    const note = await retargetSelectedIcon(format);
    const query = el("iconSearchInput").value.trim();
    if (query) { await searchDashboardIcons(query, note); return; }
    // No query left in the field: re-render the previous hits in the new
    // format, but do not re-open a result list the user has already closed.
    if (!el("iconSearchResults").hidden) renderDashboardIconResults(state.dashboardIcons.results);
    if (note) el("iconSearchHint").textContent = note;
  });
  el("iconAutoBtn").addEventListener("click", autoPickDashboardIcon);
  el("itemFaviconBtn")?.addEventListener("click", () => applySiteIcon({ manual: true }));
  // change covers Enter/paste-then-tab, blur covers leaving the field by mouse.
  el("itemUrl").addEventListener("change", () => applySiteIcon());
  el("itemUrl").addEventListener("blur", () => applySiteIcon());
  el("iconSearchResults").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-icon-url]");
    if (!btn) return;
    el("itemIcon").value = btn.dataset.iconUrl;
    el("iconSearchHint").textContent = t("icons.selected", { name: btn.dataset.iconName, format: iconFormatLabel(iconSearchFormat()) });
    el("iconSearchResults").hidden = true;
  });

  el("itemForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = el("itemId").value;
    // Saving right after typing a URL leaves no time for the automatic
    // detection to finish, so resolve the site icon here as well.
    if (!el("itemIcon").value.trim()) {
      const siteUrl = siteUrlFromInput(el("itemUrl").value);
      if (siteUrl) {
        setSiteIconHint(t("site.checking"));
        try { el("itemIcon").value = await fetchSiteIcon(siteUrl); } catch (_) { /* an icon must never block saving */ }
        setSiteIconHint("");
      }
    }
    const payload = {
      name: el("itemName").value.trim(),
      url: el("itemUrl").value.trim(),
      type: el("itemType").value === "bookmark" ? "bookmark" : "service",
      icon: el("itemIcon").value.trim() || null,
      icon_background_mode: el("itemIconBgMode").value,
      icon_background_color: normalizeColor(el("itemIconBgColor").value, "#ffffff"),
      category_id: el("itemCategory").value ? Number(el("itemCategory").value) : null,
      display_mode: el("itemDisplayMode").value,
      health_check_enabled: el("itemHealthCheck").checked,
      health_check_type: el("itemHealthCheckType").value,
    };
    try {
      if (id) {
        const updated = await api(`/items/${id}`, { method: "PUT", body: JSON.stringify(payload) });
        const idx = state.items.findIndex((i) => i.id == id);
        state.items[idx] = updated;
      } else {
        const created = await api("/items", { method: "POST", body: JSON.stringify(payload) });
        state.items.push(created);
      }
      el("itemModal").hidden = true;
      render();
    } catch (err) {
      alert(t("alert.saveErr", { message: err.message }));
    }
  });

  // ---------- Theme button ----------
  el("themeBtn").addEventListener("click", toggleTheme);

  // ---------- Search ----------
  function syncSearchControls() {
    el("searchClear").hidden = !el("searchInput").value;
    populateSearchEngines();
    syncSearchEngineUI();
  }
  el("searchInput").addEventListener("input", (e) => {
    el("searchClear").hidden = !e.target.value;
    state.searchQuery = e.target.value.trim();
  });
  el("searchClear").addEventListener("click", () => {
    el("searchInput").value = "";
    state.searchQuery = "";
    syncSearchControls();
    el("searchInput").focus();
  });
  el("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && state.searchQuery) openWebSearch(el("searchEngine").value, state.searchQuery);
  });

  function populateSearchEngines() {
    const options = Object.keys(SEARCH_ENGINES);
    const html = options.map((id) => `<option value="${id}">${escapeHtml(engineLabel(id))}</option>`).join("");
    el("searchEngine").innerHTML = html;
    el("setSearchEngine").innerHTML = html;
    const menu = el("searchEngineMenu");
    if (menu) {
      menu.innerHTML = options.map((id) => `<button type="button" class="search-engine-option" data-engine="${id}">${escapeHtml(engineLabel(id))}</button>`).join("");
      menu.querySelectorAll("[data-engine]").forEach((btn) => btn.addEventListener("click", () => selectSearchEngine(btn.dataset.engine)));
    }
    syncSearchEngineUI();
  }

  function syncSearchEngineUI() {
    const engine = state.settings.search_engine || "google";
    const select = el("searchEngine");
    const button = el("searchEngineButton");
    if (select) select.value = SEARCH_ENGINES[engine] ? engine : "google";
    if (button) {
      // The in-field switcher is a small circle, so it carries only the first
      // letter of the engine; the full name stays available as the tooltip.
      const label = SEARCH_ENGINES[engine] ? engineLabel(engine) : "Google";
      button.textContent = label.trim().charAt(0).toUpperCase();
      button.title = label;
      button.setAttribute("aria-label", t("search.engineAria", { label }));
    }
    el("searchEngineMenu")?.querySelectorAll("[data-engine]").forEach((item) => item.classList.toggle("active", item.dataset.engine === engine));
  }

  function selectSearchEngine(engine) {
    if (!SEARCH_ENGINES[engine]) return;
    saveSettingsField("search_engine", engine);
    syncSearchEngineUI();
    el("searchEngineMenu")?.setAttribute("hidden", "");
    el("searchEngineButton")?.setAttribute("aria-expanded", "false");
  }
  function openWebSearch(engine, query) {
    if (!query || !SEARCH_ENGINES[engine]) return;
    window.open(SEARCH_ENGINES[engine].url(query), "_blank", "noopener,noreferrer");
  }
  el("searchEngine").addEventListener("change", (e) => saveSettingsField("search_engine", e.target.value).then(syncSearchEngineUI));
  el("searchEngineButton").addEventListener("click", () => {
    const menu = el("searchEngineMenu");
    if (!menu) return;
    const open = !menu.hidden;
    menu.hidden = open;
    el("searchEngineButton").setAttribute("aria-expanded", String(!open));
  });
  document.addEventListener("click", (e) => {
    const wrap = el("searchEngineCustom");
    if (wrap && !wrap.contains(e.target)) {
      el("searchEngineMenu")?.setAttribute("hidden", "");
      el("searchEngineButton")?.setAttribute("aria-expanded", "false");
    }
  });

  // ---------- Settings modal ----------
  function updateWeatherCityState() {
    const mode = el("setWeatherLocationMode");
    const city = el("setWeatherCity");
    if (!mode || !city) return;
    const isCity = mode.value === "city";
    city.disabled = !isCity;
    city.closest(".field")?.classList.toggle("disabled", !isCity);
  }

  // ---------- Wallpaper modal ----------
  // Everything about the app background lives in its own dialog since v27: the
  // album, the flat-fill palette and the rotation schedule need more room than a
  // settings column, and the album is what people come back to most often.
  const BACKGROUND_PALETTE = [
    "#10151b", "#1b2430", "#243447", "#2f4858", "#37474f", "#3e3b5b",
    "#4a3b52", "#5d4037", "#6d4c41", "#1e5245", "#26734d", "#2e7d32",
    "#0d4f6c", "#1565c0", "#4527a0", "#6a1b9a", "#ad1457", "#b71c1c",
    "#c05621", "#e08e0b", "#8d9440", "#78909c", "#b0bec5", "#eceff1",
  ];
  const ROTATION_UNITS = { minutes: 60 * 1000, hours: 60 * 60 * 1000 };

  function updateBackgroundStatus() {
    const bg = state.settings.background || "";
    const status = el("backgroundStatus");
    if (!status) return;
    status.textContent = !bg
      ? t("bg.default")
      : (isColorBackground(bg)
        ? t("bg.color")
        : (bg.startsWith("/wallpaper/")
          ? t("bg.builtin")
          : (bg.startsWith("/api/backgrounds/") || bg.startsWith("data:")
            ? t("bg.uploaded")
            : t("bg.link"))));
  }

  let builtinWallpapers = null;

  async function loadBuiltinWallpapers() {
    if (builtinWallpapers) return builtinWallpapers;
    try {
      const data = await api("/backgrounds/builtin");
      builtinWallpapers = Array.isArray(data?.wallpapers) ? data.wallpapers : [];
    } catch (_) {
      builtinWallpapers = [];
    }
    return builtinWallpapers;
  }

  // The album: built-in wallpapers first, then anything uploaded from disk. A
  // flat fill is never a thumb — it comes from the palette below instead.
  function galleryEntries() {
    const builtin = Array.isArray(builtinWallpapers) ? builtinWallpapers : [];
    const history = (Array.isArray(state.backgroundHistory) ? state.backgroundHistory : [])
      .filter((url) => url && !isColorBackground(url) && !builtin.some((item) => item.url === url));
    return [
      ...builtin.map((item) => ({ url: item.url, label: item.name || t("bg.wallpaper") })),
      ...history.map((url, i) => ({ url, label: t("bg.custom", { n: i + 1 }) })),
    ];
  }

  function rotationEnabled() { return state.settings.background_rotation_enabled === "true"; }

  function rotationList() {
    try {
      const parsed = JSON.parse(state.settings.background_rotation_list || "[]");
      return Array.isArray(parsed) ? parsed.filter((url) => typeof url === "string" && url) : [];
    } catch (_) { return []; }
  }

  // An empty selection means "the whole album" rather than "nothing": it is the
  // state the setting starts in, and stopping the carousel is what the checkbox
  // above is for.
  function rotationPool() {
    const all = galleryEntries().map((item) => item.url);
    const chosen = rotationList().filter((url) => all.includes(url));
    return chosen.length ? chosen : all;
  }

  function renderBackgroundGallery() {
    const gallery = el("backgroundGallery");
    if (!gallery) return;
    const picking = rotationEnabled();
    const chosen = new Set(rotationList());
    gallery.classList.toggle("picking", picking);
    gallery.innerHTML = galleryEntries().map((item) => {
      const active = state.settings.background === item.url ? " active" : "";
      const on = chosen.has(item.url) ? " on" : "";
      const pickTitle = escapeAttr(t(chosen.has(item.url) ? "wallpaper.inRotation" : "wallpaper.notInRotation"));
      return `<button type="button" class="background-thumb${active}" data-bg-url="${escapeAttr(item.url)}" title="${escapeAttr(item.label)}">` +
        `<span class="background-thumb-media"><img src="${escapeAttr(item.url)}" alt="" loading="lazy" onerror="this.closest('.background-thumb')?.remove()"></span>` +
        `<span class="background-thumb-label">${escapeHtml(item.label)}</span>` +
        `<span class="background-thumb-pick${on}" data-pick="${escapeAttr(item.url)}" title="${pickTitle}">${chosen.has(item.url) ? "✓" : ""}</span></button>`;
    }).join("");
    gallery.querySelectorAll("[data-bg-url]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        // The corner toggle sits inside the tile, so it has to claim the click
        // before the tile applies the wallpaper.
        const pick = e.target.closest("[data-pick]");
        if (pick) { e.preventDefault(); await toggleRotationMember(pick); return; }
        await applyBackground(btn.dataset.bgUrl);
      });
    });
  }

  // The album and the palette are rebuilt only when their contents change (a new
  // upload, a language switch). Choosing a wallpaper just moves the accent
  // border, so it is done in place — a rebuild would scroll the album back to the
  // top after every single click.
  function syncActiveBackground() {
    const current = String(state.settings.background || "");
    el("backgroundGallery")?.querySelectorAll(".background-thumb").forEach((thumb) => {
      thumb.classList.toggle("active", thumb.dataset.bgUrl === current);
    });
    const lower = current.toLowerCase();
    el("backgroundPalette")?.querySelectorAll(".color-swatch").forEach((swatch) => {
      swatch.classList.toggle("active", swatch.dataset.bgColor === lower);
    });
  }

  // Same reasoning for the rotation membership marks.
  function syncRotationPicks() {
    const gallery = el("backgroundGallery");
    if (!gallery) return;
    const chosen = new Set(rotationList());
    gallery.classList.toggle("picking", rotationEnabled());
    gallery.querySelectorAll("[data-pick]").forEach((pick) => {
      const on = chosen.has(pick.dataset.pick);
      pick.classList.toggle("on", on);
      pick.textContent = on ? "✓" : "";
      pick.title = t(on ? "wallpaper.inRotation" : "wallpaper.notInRotation");
    });
  }

  function renderBackgroundPalette() {
    const palette = el("backgroundPalette");
    if (!palette) return;
    const current = String(state.settings.background || "").toLowerCase();
    palette.innerHTML = BACKGROUND_PALETTE.map((color) =>
      `<button type="button" class="color-swatch${current === color ? " active" : ""}" data-bg-color="${escapeAttr(color)}" style="background:${escapeAttr(color)}" title="${escapeAttr(color)}" aria-label="${escapeAttr(color)}"></button>`
    ).join("");
    palette.querySelectorAll("[data-bg-color]").forEach((btn) => {
      btn.addEventListener("click", () => applyBackground(btn.dataset.bgColor));
    });
  }

  // One entry point for every way of choosing a background, so the album, the
  // palette and the rotation all leave the dialog in a consistent state.
  async function applyBackground(value) {
    await saveSettingsFields({ background: value, background_rotation_last: nowStamp() });
    syncActiveBackground();
    updateBackgroundStatus();
    scheduleBackgroundRotation();
  }

  function nowStamp() { return String(Date.now()); }

  async function toggleRotationMember(pick) {
    const url = pick.dataset.pick;
    const chosen = rotationList();
    const next = chosen.includes(url) ? chosen.filter((x) => x !== url) : [...chosen, url];
    await saveSettingsField("background_rotation_list", JSON.stringify(next));
    syncRotationPicks();
    updateRotationStatus();
    scheduleBackgroundRotation();
  }

  function backgroundRotationMs() {
    const raw = Number(state.settings.background_rotation_value);
    const value = Math.min(999, Math.max(1, Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 30));
    return value * (ROTATION_UNITS[state.settings.background_rotation_unit] || ROTATION_UNITS.minutes);
  }

  function updateRotationStatus() {
    const status = el("rotationStatus");
    if (!status) return;
    if (!rotationEnabled()) { status.textContent = t("wallpaper.rotationOff"); return; }
    const chosen = rotationList().length;
    const total = galleryEntries().length;
    status.textContent = chosen
      ? t("wallpaper.rotationPicked", { n: chosen, total })
      : t("wallpaper.rotationAll", { total });
  }

  let rotationTimer = null;

  // The last switch is stored, so a reload resumes the wait instead of restarting
  // it — otherwise a tab reopened every few minutes would never rotate at all.
  function scheduleBackgroundRotation() {
    clearTimeout(rotationTimer);
    rotationTimer = null;
    if (!rotationEnabled()) return;
    const period = backgroundRotationMs();
    const last = Number(state.settings.background_rotation_last);
    const elapsed = Number.isFinite(last) && last > 0 ? Date.now() - last : period;
    const wait = Math.max(1000, period - Math.max(0, elapsed));
    rotationTimer = setTimeout(rotateBackground, wait);
  }

  async function rotateBackground() {
    if (!rotationEnabled()) return;
    await loadBuiltinWallpapers();
    const pool = rotationPool();
    if (!pool.length) { scheduleBackgroundRotation(); return; }
    const index = pool.indexOf(state.settings.background || "");
    const next = pool[(index + 1) % pool.length];
    try {
      await saveSettingsFields({ background: next, background_rotation_last: nowStamp() });
    } catch (_) { /* offline: try again after the next interval */ }
    if (!el("wallpaperModal")?.hidden) { syncActiveBackground(); updateBackgroundStatus(); }
    scheduleBackgroundRotation();
  }

  function fillWallpaperForm() {
    const s = state.settings;
    el("setBackgroundColor").value = isColorBackground(s.background) ? s.background : "#10151b";
    el("setRotationEnabled").checked = rotationEnabled();
    el("setRotationValue").value = s.background_rotation_value || "30";
    el("setRotationUnit").value = s.background_rotation_unit === "hours" ? "hours" : "minutes";
    syncRotationControls();
    updateBackgroundStatus();
    updateRotationStatus();
    renderBackgroundPalette();
    renderBackgroundGallery();
    loadBuiltinWallpapers().then(() => { renderBackgroundGallery(); updateRotationStatus(); });
  }

  // The interval and the per-thumb picks are meaningless while the carousel is
  // off, so they grey out together.
  function syncRotationControls() {
    const on = el("setRotationEnabled")?.checked;
    ["setRotationValue", "setRotationUnit", "rotationSelectAllBtn", "rotationClearBtn"].forEach((id) => {
      const node = el(id);
      if (!node) return;
      node.disabled = !on;
      node.closest(".field")?.classList.toggle("disabled", !on);
    });
  }

  function renderCategoryManager() {
    const manager = el("categoryManager");
    if (!manager) return;
    manager.innerHTML = state.categories.map((c) => `
      <div class="category-row">
        <input type="text" class="category-name" data-id="${c.id}" value="${escapeAttr(c.name)}">
        <button type="button" data-id="${c.id}">${escapeHtml(t("common.delete"))}</button>
      </div>`).join("") || `<p style="color:var(--text-muted); font-size:13px;">${escapeHtml(t("category.empty"))}</p>`;

    // A category name is also the title of its block, so renaming here has to
    // reach the blocks as well — renameCategory re-renders both.
    manager.querySelectorAll("input.category-name").forEach((input) => {
      const commit = async () => {
        const id = input.dataset.id;
        const current = state.categories.find((c) => c.id == id)?.name || "";
        const next = input.value.trim();
        if (!next || next === current) { input.value = current; return; }
        try {
          await renameCategory(id, next);
        } catch (err) {
          input.value = current;
          alert(t("alert.saveErr", { message: err.message }));
        }
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        if (e.key === "Escape") {
          e.preventDefault();
          input.value = state.categories.find((c) => c.id == input.dataset.id)?.name || "";
          input.blur();
        }
      });
    });

    manager.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const catId = btn.dataset.id;
        const cat = state.categories.find((c) => c.id == catId);
        if (!cat) return;
        showConfirm(t("confirm.deleteCategory", { name: cat.name }), async () => {
          await api(`/categories/${catId}`, { method: "DELETE" });
          state.categories = state.categories.filter((c) => c.id != catId);
          state.items.forEach((item) => { if (item.category_id == catId) item.category_id = null; });
          renderCategoryManager();
          render();
        });
      });
    });
  }

  function fillSettingsForm() {
    const s = state.settings; populateSearchEngines();
    el("setSearchEngine").value = s.search_engine || "google";
    el("setSearchEngineVisible").checked = s.search_engine_visible !== "false";
    el("setSearchWidth").value = s.search_width || String(DEFAULT_SEARCH_WIDTH);
    el("setSearchHeight").value = s.search_height || "38";
    el("setTheme").value = s.theme === "light" ? "light" : "dark"; populateFonts(); el("setFont").value = s.font || "system";
    el("setLanguage").value = currentLang();
    el("setCardSize").value = s.card_size || "medium"; el("setColumns").value = s.columns || "auto"; el("setSortMode").value = s.sort_mode || "custom";
    el("setBlockSize").value = s.block_size || "medium";
    el("setCardsAreaWidth").value = s.cards_area_width || "100"; el("cardsAreaWidthValue").textContent = `${s.cards_area_width || 100}%`;
    // The checkbox reads the other way round from the stored flag: it is on when
    // the icons *do* have a background.
    el("setCardIconBackground").checked = !cardIconPlain();
    el("setIconBackgroundColor").value = iconBackgroundColor();
    el("setIconBackgroundColor").disabled = cardIconPlain();
    for (const field of OPACITY_FIELDS) {
      const percent = transparencyPercent(field);
      el(field.input).value = String(percent);
      el(field.output).textContent = `${percent}%`;
    }
    syncLinkBehaviorSwitch(s.link_behavior !== "current_tab");
    el("setConfirmExternal").checked = s.confirm_external_links === "true";
    el("setDateEnabled").checked = s.widget_date_enabled === "true";
    el("setTimeEnabled").checked = s.widget_time_enabled === "true";
    el("setWeatherEnabled").checked = s.widget_weather_enabled === "true";
    el("setPingEnabled").checked = s.widget_ping_enabled === "true";
    el("setStickyEnabled").checked = s.widget_sticky_enabled === "true";
    el("setSpeedEnabled").checked = s.widget_speed_enabled === "true";
    updateWeatherCityState(); renderCategoryManager();
  }

  // "Открывать" is a switch, not a select: on means a new tab. The word beside the
  // track keeps its own data-i18n key so a language switch redraws it with
  // everything else.
  function syncLinkBehaviorSwitch(newTab) {
    const box = el("setLinkBehavior");
    if (!box) return;
    box.checked = newTab;
    const text = el("setLinkBehaviorText");
    if (!text) return;
    text.dataset.i18n = newTab ? "link.newTabShort" : "link.currentTabShort";
    text.textContent = t(text.dataset.i18n);
  }

  // Tick marks under a range input, one every ten, each of them a click target
  // that moves the handle to its value. The marks are built from the input's own
  // min/max so the markup only has to say which slider it decorates.
  const RANGE_TICK_STEP = 10;

  function buildRangeTicks(container) {
    const input = el(container.dataset.ticksFor);
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const span = max - min;
    if (!(span > 0)) return;

    container.textContent = "";
    for (let value = min; value <= max; value += RANGE_TICK_STEP) {
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = "range-tick";
      tick.style.left = `${((value - min) / span) * 100}%`;
      tick.dataset.value = String(value);
      if (value === min || value === max || (value - min) % (RANGE_TICK_STEP * 5) === 0) tick.dataset.major = "true";
      // The slider itself is the keyboard control; the ticks are a pointer
      // shortcut and stay out of the tab order.
      tick.tabIndex = -1;
      tick.setAttribute("aria-hidden", "true");
      container.appendChild(tick);
    }

    container.addEventListener("click", (e) => {
      const tick = e.target.closest(".range-tick");
      if (!tick) return;
      input.value = tick.dataset.value;
      // Same two events a drag would fire, so the live preview and the save both
      // run through the handlers the slider already has.
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  document.querySelectorAll("[data-ticks-for]").forEach(buildRangeTicks);

  async function uploadBackgroundFile(file) {
    const response = await fetch("/api/backgrounds", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      let message = response.statusText;
      try { message = (await response.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    return response.json();
  }

  el("setBackgroundFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadBackgroundFile(file);
      const url = uploaded.url;
      state.backgroundHistory = [url, ...(state.backgroundHistory || []).filter((x) => x !== url)].slice(0, 10);
      await saveSettingsFields({ background_history: JSON.stringify(state.backgroundHistory), background: url, background_rotation_last: nowStamp() });
      // A rebuild here, not an in-place sync: the album has gained a thumb.
      renderBackgroundGallery();
      syncActiveBackground();
      updateBackgroundStatus();
      updateRotationStatus();
      scheduleBackgroundRotation();
    } catch (err) {
      alert(t("alert.bgErr", { message: err?.message || t("error.unknown") }));
    } finally {
      e.target.value = "";
    }
  });

  el("resetBackgroundBtn")?.addEventListener("click", () => applyBackground(""));

  el("setBackgroundColor")?.addEventListener("change", (e) => applyBackground(normalizeColor(e.target.value, "#10151b")));

  el("setRotationEnabled")?.addEventListener("change", async (e) => {
    syncRotationControls();
    // Start counting from the moment it was switched on, not from whenever the
    // wallpaper last happened to change.
    await saveSettingsFields({ background_rotation_enabled: e.target.checked, background_rotation_last: nowStamp() });
    syncRotationPicks();
    updateRotationStatus();
    scheduleBackgroundRotation();
  });

  el("setRotationValue")?.addEventListener("change", async (e) => {
    const value = Math.min(999, Math.max(1, Math.round(Number(e.target.value) || 30)));
    e.target.value = String(value);
    await saveSettingsFields({ background_rotation_value: value, background_rotation_last: nowStamp() });
    scheduleBackgroundRotation();
  });

  el("setRotationUnit")?.addEventListener("change", async (e) => {
    await saveSettingsFields({ background_rotation_unit: e.target.value === "hours" ? "hours" : "minutes", background_rotation_last: nowStamp() });
    scheduleBackgroundRotation();
  });

  el("rotationSelectAllBtn")?.addEventListener("click", async () => {
    await saveSettingsField("background_rotation_list", JSON.stringify(galleryEntries().map((item) => item.url)));
    syncRotationPicks();
    updateRotationStatus();
    scheduleBackgroundRotation();
  });

  // Clearing means "no explicit picks", which rotationPool reads as the whole
  // album — the checkbox above is what turns the carousel off.
  el("rotationClearBtn")?.addEventListener("click", async () => {
    await saveSettingsField("background_rotation_list", "[]");
    syncRotationPicks();
    updateRotationStatus();
    scheduleBackgroundRotation();
  });

  el("wallpaperBtn")?.addEventListener("click", () => {
    fillWallpaperForm();
    el("wallpaperModal").hidden = false;
  });
  el("wallpaperCloseBtn")?.addEventListener("click", () => { el("wallpaperModal").hidden = true; });
  el("wallpaperXBtn")?.addEventListener("click", () => { el("wallpaperModal").hidden = true; });

  el("addCategoryBtn")?.addEventListener("click", async () => {
    const name = el("newCategoryName")?.value.trim();
    if (!name) return;
    const cat = await api("/categories", { method: "POST", body: JSON.stringify({ name }) });
    state.categories.push(cat);
    el("newCategoryName").value = "";
    renderCategoryManager();
  });

  el("settingsBtn").addEventListener("click", () => {
    fillSettingsForm();
    el("settingsModal").hidden = false;
  });
  el("settingsCloseBtn").addEventListener("click", () => { el("settingsModal").hidden = true; render(); });
  el("settingsXBtn").addEventListener("click", () => { el("settingsModal").hidden = true; render(); });

  el("setSearchEngine").addEventListener("change", e => saveSettingsField("search_engine", e.target.value));
  const basicMap = {setSearchEngineVisible:"search_engine_visible",setSearchWidth:"search_width",setSearchHeight:"search_height"};
  Object.entries(basicMap).forEach(([id,key]) => el(id)?.addEventListener("change", e => saveSettingsField(key, e.target.type === "checkbox" ? e.target.checked : e.target.value)));
  el("setTheme").addEventListener("change", e => saveSettingsField("theme", e.target.value));
  el("setFont").addEventListener("change", e => saveSettingsField("font", e.target.value));
  // Static markup is re-translated inside applySettingsToUI; everything the
  // renderer builds from the dictionary has to be rebuilt here.
  el("setLanguage").addEventListener("change", async (e) => {
    await saveSettingsField("language", e.target.value === "en" ? "en" : "ru");
    state.weather.error = null;
    fillSettingsForm();
    render();
    renderWidgets();
    // The Monitoring window builds every label from the dictionary too, and it
    // may well be open behind the settings panel.
    renderMonitor();
  });
  el("setCardSize").addEventListener("change", e => saveSettingsField("card_size", e.target.value));
  el("setBlockSize").addEventListener("change", e => saveSettingsField("block_size", e.target.value));
  // The tile fill is written as an inline style by the renderer, so the cards
  // have to be re-rendered for this switch to take effect.
  el("setCardIconBackground").addEventListener("change", async (e) => {
    el("setIconBackgroundColor").disabled = !e.target.checked;
    await saveSettingsField("card_icon_plain", !e.target.checked);
    render();
  });
  el("setIconBackgroundColor").addEventListener("change", async (e) => {
    await saveSettingsField("icon_background_color", e.target.value);
    render();
  });
  // Live preview while dragging (the CSS variable alone repaints every surface),
  // then one save when the slider is released.
  for (const field of OPACITY_FIELDS) {
    el(field.input).addEventListener("input", (e) => {
      el(field.output).textContent = `${e.target.value}%`;
      applyTransparency(field.cssVar, Number(e.target.value));
    });
    el(field.input).addEventListener("change", e => saveSettingsField(field.key, e.target.value));
  }
  el("setCardsAreaWidth").addEventListener("input", e => { el("cardsAreaWidthValue").textContent = `${e.target.value}%`; document.documentElement.style.setProperty("--cards-area-width", `${e.target.value}%`); });
  el("setCardsAreaWidth").addEventListener("change", e => saveSettingsField("cards_area_width", e.target.value));
  el("setColumns").addEventListener("change", e => saveSettingsField("columns", e.target.value));
  el("setSortMode").addEventListener("change", e => saveSettingsField("sort_mode", e.target.value));
  el("setLinkBehavior").addEventListener("change", (e) => {
    syncLinkBehaviorSwitch(e.target.checked);
    saveSettingsField("link_behavior", e.target.checked ? "new_tab" : "current_tab");
  });
  el("setConfirmExternal").addEventListener("change", e => saveSettingsField("confirm_external_links", e.target.checked));
  // Only visibility (show/hide) toggles live in the general settings modal.
  // Everything else about a widget's appearance/behaviour is configured via
  // right-click on the widget itself (see the widget popover below).
  const widgetEnabledMap = {
    setDateEnabled: "widget_date_enabled",
    setTimeEnabled: "widget_time_enabled",
    setWeatherEnabled: "widget_weather_enabled",
    setPingEnabled: "widget_ping_enabled",
    setStickyEnabled: "widget_sticky_enabled",
    setSpeedEnabled: "widget_speed_enabled",
  };
  Object.entries(widgetEnabledMap).forEach(([id, key]) => el(id)?.addEventListener("change", async (e) => {
    await saveSettingsField(key, e.target.checked);
    if (key === "widget_weather_enabled") { state.weather.data = null; state.weather.error = null; clearTimeout(weatherRefreshTimer); }
    if (key === "widget_ping_enabled") { state.ping.data = []; stopPingRefresh(); if (state.settings.widget_ping_enabled === "true") refreshPing(); }
    renderWidgets();
  }));

  // ---------- Export / Import ----------
  el("exportBtn").addEventListener("click", () => { window.location.href = "/api/backup/export"; });

  el("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm(t("confirm.import"))) return;
      await api("/backup/import", { method: "POST", body: JSON.stringify(data) });
      await loadAll();
      alert(t("alert.importOk"));
    } catch (err) {
      alert(t("alert.importErr", { message: err.message }));
    } finally {
      e.target.value = "";
    }
  });

  // ---------- Close modals on overlay click / Escape ----------
  // Overlays can stack (confirm over settings), so both gestures act on the
  // topmost one only — Escape inside a confirmation must not also throw away
  // the settings dialog that asked the question.
  function openOverlays() {
    return [...document.querySelectorAll(".modal-overlay")].filter((o) => !o.hidden);
  }
  function topOverlay() {
    const open = openOverlays();
    if (!open.length) return null;
    // Painted order = the CSS z-index, falling back to document order.
    return open.reduce((top, o) => {
      const z = Number(getComputedStyle(o).zIndex) || 0;
      const topZ = Number(getComputedStyle(top).zIndex) || 0;
      return z >= topZ ? o : top;
    });
  }
  function dismissOverlay(overlay) {
    if (!overlay) return;
    if (overlay.id === "confirmModal") closeConfirm();
    // Hiding the monitor window is not enough — its 30-second refresh has to be
    // stopped, or Escape would leave a timer polling for a closed window.
    else if (overlay.id === "monitorModal") closeMonitorModal();
    else overlay.hidden = true;
  }
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) dismissOverlay(overlay); });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // A drag in progress is the most immediate thing Escape can undo.
    if (drag && drag.active) { cancelDrag(); return; }
    const top = topOverlay();
    if (top) { dismissOverlay(top); return; }
    hideContextMenu();
    hideWidgetContextMenu();
    closeWidgetPopover();
  });


  async function resetSettings(scope) {
    if (!confirm(scope === "appearance" ? t("confirm.resetAppearance") : t("confirm.resetCards"))) return;
    try {
      const updated = await api(`/settings/reset/${scope}`, { method: "POST" });
      state.settings = updated;
      applySettingsToUI();
      fillSettingsForm();
      // The wallpaper and its rotation belong to the appearance scope, so a reset
      // there also has to stop the carousel and refresh its dialog.
      if (scope === "appearance") { fillWallpaperForm(); scheduleBackgroundRotation(); }
      render();
      renderWidgets();
    } catch (err) {
      alert(t("alert.resetErr", { message: err?.message || t("error.generic") }));
    }
  }

  el("resetAppearanceBtn").addEventListener("click", () => resetSettings("appearance"));
  el("resetCardsBtn").addEventListener("click", () => resetSettings("cards"));

  // ---------- Init ----------
  loadAll().then(() => {
    syncSearchControls();
    setInterval(refreshHealthOnly, 15000);
    setInterval(updateClockWidgets, 1000);
  }).catch((err) => {
    console.error("Failed to load portal data", err);
    el("emptyState").hidden = false;
    el("emptyState").textContent = t("error.loadFailed");
  });
})();
