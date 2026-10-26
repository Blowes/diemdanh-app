import Foundation
import Capacitor
import Photos
import UIKit

/**
 * Lưu ảnh / video vào Thư viện ảnh iOS (album "Điểm Danh").
 * Đối xứng với SaveToGalleryPlugin.java bên Android. Cần NSPhotoLibraryAddUsageDescription.
 */
@objc(SaveToGalleryPlugin)
public class SaveToGalleryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SaveToGalleryPlugin"
    public let jsName = "SaveToGallery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
    ]

    @objc func save(_ call: CAPPluginCall) {
        let mime = call.getString("mime") ?? "image/png"
        let album = call.getString("album") ?? "Điểm Danh"
        let isVideo = mime.hasPrefix("video/")

        guard let b64 = call.getString("base64"), let data = Data(base64Encoded: b64) else {
            call.reject("Thiếu dữ liệu")
            return
        }

        let onStatus: (PHAuthorizationStatus) -> Void = { status in
            let ok: Bool
            if #available(iOS 14, *) {
                ok = (status == .authorized || status == .limited)
            } else {
                ok = (status == .authorized)
            }
            guard ok else {
                call.reject("Chưa cho phép lưu vào Thư viện ảnh")
                return
            }
            self.performSave(data: data, isVideo: isVideo, mime: mime, album: album, call: call)
        }
        if #available(iOS 14, *) {
            PHPhotoLibrary.requestAuthorization(for: .addOnly, handler: onStatus)
        } else {
            PHPhotoLibrary.requestAuthorization(onStatus)
        }
    }

    private func performSave(data: Data, isVideo: Bool, mime: String, album: String, call: CAPPluginCall) {
        // tìm hoặc tạo album
        let collection = self.getOrCreateAlbum(named: album)

        // với video phải ghi ra file tạm trước
        var tempURL: URL?
        if isVideo {
            let ext = mime.contains("quicktime") ? "mov" : "mp4"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("dd-\(UUID().uuidString).\(ext)")
            do { try data.write(to: url) } catch { call.reject("Không ghi được video tạm: \(error.localizedDescription)"); return }
            tempURL = url
        } else {
            guard UIImage(data: data) != nil else { call.reject("Ảnh không hợp lệ"); return }
        }

        var localId: String?
        PHPhotoLibrary.shared().performChanges({
            let request: PHAssetChangeRequest?
            if isVideo, let url = tempURL {
                request = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            } else if let image = UIImage(data: data) {
                request = PHAssetChangeRequest.creationRequestForAsset(from: image)
            } else {
                request = nil
            }
            guard let req = request, let placeholder = req.placeholderForCreatedAsset else { return }
            localId = placeholder.localIdentifier
            if let coll = collection,
               let albumChange = PHAssetCollectionChangeRequest(for: coll) {
                albumChange.addAssets([placeholder] as NSArray)
            }
        }, completionHandler: { success, error in
            if let url = tempURL { try? FileManager.default.removeItem(at: url) }
            if success {
                call.resolve(["uri": localId ?? ""])
            } else {
                call.reject("Lưu thất bại: \(error?.localizedDescription ?? "không rõ")")
            }
        })
    }

    private func getOrCreateAlbum(named title: String) -> PHAssetCollection? {
        // đã tồn tại?
        let opts = PHFetchOptions()
        opts.predicate = NSPredicate(format: "title = %@", title)
        let found = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: opts)
        if let existing = found.firstObject { return existing }

        // tạo mới (đồng bộ)
        var placeholder: PHObjectPlaceholder?
        do {
            try PHPhotoLibrary.shared().performChangesAndWait {
                let req = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: title)
                placeholder = req.placeholderForCreatedAssetCollection
            }
        } catch {
            return nil
        }
        guard let id = placeholder?.localIdentifier else { return nil }
        let coll = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [id], options: nil)
        return coll.firstObject
    }
}
