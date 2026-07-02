# 🏛️ Agent Atabey — Kör Noktalar, Sınırlar ve Gelişim Raporu (BLINDSPOTS)

Bu dosya, **Agent Atabey** projesinin güncel mimari kısıtlarını, geliştirme aşamasındaki zayıf yönlerini ve projenin "Enterprise Governance" iddiası ile mevcut teknik gerçekliği arasındaki boşlukları dürüstçe ortaya koymaktadır.

---

## 1. "Vibe Coding" & Erken Aşama Olgunluk Seviyesi
* **Mevcut Durum:** npm registry üzerinde `0.0.x` sürümlerinde seyreden, tek bir geliştirici tarafından 18 günde 20'den fazla sürüm yayınlanmış pre-alpha aşamasında bir projedir. GitHub üzerinde yıldız, fork veya topluluk doğrulaması henüz bulunmamaktadır.
* **Kör Nokta:** Proje, pazarlama dilinde "Enterprise-Grade Governance" ve "Autonomous Orchestrator" olarak sunulsa da henüz üretim ortamlarında (production) test edilmemiştir. Sürüm geçişlerinin çok hızlı ve düzensiz olması, kararlılık (stability) güvencesi sunmamaktadır.
* **Çözüm/Yol Haritası:** Sürüm yönetiminin semantik versiyonlama (SemVer) kurallarına sıkı sıkıya uyması, test kapsamının genişletilmesi ve projenin "aktif bir açık kaynak deneyi" olarak konumlandırılması gerekmektedir.

---

## 2. Risk Motorunun Deterministik Yapısı
* **Mevcut Durum:** `RiskEngine` sınıfı, görev tanımlarını ve dosya değişikliklerini puanlamak için statik anahtar kelimeler (`delete`, `drop`, `truncate`, `rm -rf`) ve regex şablonları kullanmaktadır.
* **Kör Nokta:** Tanıtımlarda "AI-driven Risk Engine" veya "Contextual Behavioral Analysis" gibi lanse edilen yapı, aslında **200 satırlık basit bir deterministik kural motorudur**. Karmaşık, dolaylı veya manipülatif (prompt injection) komutları tespit etmekte yetersiz kalabilir.
* **Çözüm/Yol Haritası:** Regex tabanlı kural motoru ilk savunma hattı olarak kalmalı, ancak onun arkasına LLM tabanlı bir niyet analizi (Intent Classification) ve güvenlik duvarı (Guardrails) eklenmelidir.

---

## 3. Sandboxing (Güvenli Çalışma Alanı) Eksikliği
* **Mevcut Durum:** Ajanların yürüttüğü otonom kabuk komutları (`run_command`), geliştiricinin yerel makinesinde doğrudan çalıştırılmaktadır.
* **Kör Nokta (En Büyük Güvenlik Riski):** Ajanın kontrol dışı kalması (Rogue AI) veya prompt injection saldırısına uğraması durumunda, yerel sistemdeki tüm dosyaların silinmesi, ortam değişkenlerinin (`.env`) sızdırılması veya sisteme zararlı yazılım indirilmesi mümkündür. Gerçek bir kurumsal ortamda denetimsiz ajanların yerel makinede bash çalıştırmasına izin verilemez.
* **Çözüm/Yol Haritası:** Komut çalıştırma ve dosya manipülasyon işlemlerinin izole edilmiş **Docker konteynerleri**, **WASM sandbox** veya geçici mikro sanal makineler (MicroVM) içinde çalıştırılmasını zorunlu kılan güvenli bir runtime soyutlaması eklenmelidir.

---

## 4. Dosya Tabanlı İletişim (Hermes) Kısıtları
* **Mevcut Durum:** Çoklu ajan (multi-agent) orkestrasyonu, `.atabey/messages/` dizinindeki JSON dosyaları ve yerel dosya kilitleri (`.lock`) üzerinden yürütülmektedir.
* **Kör Nokta:** Bu mekanizma tek bir yerel makinede çalışırken yeterlidir. Ancak birden fazla geliştiricinin ortak çalıştığı veya CI/CD hatlarında otonom ajanların dağıtık koşturulduğu kurumsal senaryolarda dosya kilitleri çakışacak ve git üzerinde conflict'ler oluşacaktır.
* **Çözüm/Yol Haritası:** Hermes Message Broker mimarisinin soyutlanarak, üretim ortamları için **Redis Pub/Sub, NATS veya RabbitMQ** gibi gerçek mesaj kuyruğu adaptörlerine izin verecek şekilde tasarlanması gerekir.

---

## 5. Regex Tabanlı PII Maskeleme Sınırları
* **Mevcut Durum:** PII maskeleme modülü (`packages/shared/src/pii.ts`), e-posta, telefon, TC Kimlik No, IBAN ve API anahtarlarını regex ile bulup maskelemektedir.
* **Kör Nokta:** Regex, yapılandırılmış verilerde iyi çalışsa da serbest metinlerde (metin içinde geçen isimler, adresler, özel sağlık bilgileri vb.) yetersiz kalır ve false-positive/false-negative oranları yüksektir.
* **Çözüm/Yol Haritası:** Regex kurallarına ek olarak, yerel veya hafif bir NLP modeli (örn. Presidio Analyzer veya yerel çalışan küçük bir NER modeli) ile semantik hassas veri analizi entegre edilmelidir.

---

## 6. Gecikmeli AST/Uyum Doğrulaması
* **Mevcut Durum:** Kod kurallarına uyumluluk (örneğin `any` kullanımı, yasaklı loglar vb.) kod yazılıp diske kaydedildikten sonra `check:compliance` gibi araçlarla post-facto taranmaktadır.
* **Kör Nokta:** Ajan hatayı yapıp dosyayı kaydettikten sonra tarama yapılması zaman kaybına yol açar. Ajan hatalı kodu baz alarak yeni kodlar yazmaya devam edebilir.
* **Çözüm/Yol Haritası:** Uyum kontrollerinin (Compliance/Quality Gates) MCP `write_file` veya `replace_text` aşamasında, **dosya diske yazılmadan önce in-memory AST analiziyle** durdurulması ve ihlal durumunda ajana anında geri bildirim verilmesi sağlanmalıdır.

---

## 7. HITL (Human-in-the-Loop) Geliştirici Deneyimi (DX)
* **Mevcut Durum:** Risk skoru yüksek işlemlerde onay mekanizması, kullanıcının terminale geçip `atabey approve [traceId]` yazmasını gerektirir.
* **Kör Nokta:** Bu akış, geliştiricinin odaklanma sürecini (flow state) kesintiye uğratır ve sürekli terminal penceresini izleme zorunluluğu yaratır.
* **Çözüm/Yol Haritası:** Onay sürecinin Slack, MS Teams gibi kurumsal iletişim araçlarına (interaktif butonlar ile) veya GitHub Pull Request yorum hatlarına (`/approve` vb.) taşınarak entegre edilmesi gerekir.

---

## 8. Bağımlılık ve Kurulum Zorlukları
* **Mevcut Durum:** Proje, yerel depolama için native derleme gerektiren `better-sqlite3` paketine bağımlıdır.
* **Kör Nokta:** Farklı Node.js sürümlerinde veya kısıtlı işletim sistemi yetkilerine sahip CI/CD ortamlarında native derleme hataları oluşabilir. Bu durum "npx atabey init" ile sıfır kurulum vaadini baltalamaktadır.
* **Çözüm/Yol Haritası:** Native derleme gerektirmeyen pure-JS SQLite kütüphanelerine (örn. `@libsql/client` / sqlean) geçiş seçeneği sunulmalıdır.
