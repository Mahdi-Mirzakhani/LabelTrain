import sys
import os
import json
import csv
import xml.etree.ElementTree as ET
from xml.dom import minidom
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import cv2
import numpy as np
from PIL import Image

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QGridLayout, QLabel, QListWidget, QListWidgetItem, QPushButton, 
    QComboBox, QSpinBox, QSlider, QGroupBox, QFrame, QSplitter,
    QFileDialog, QMessageBox, QInputDialog, QDialog, QLineEdit,
    QTextEdit, QTabWidget, QProgressBar, QToolBar, QStatusBar,
    QScrollArea, QCheckBox, QRadioButton, QButtonGroup, QSpacerItem,
    QSizePolicy, QGraphicsView, QGraphicsScene, QGraphicsPixmapItem,
    QGraphicsRectItem, QMenu, QColorDialog,
    QFontDialog, QTableWidget, QTableWidgetItem, QHeaderView
)
from PyQt6.QtCore import (
    Qt, QRectF, QPointF, QSizeF, pyqtSignal, QThread, QTimer,
    QPropertyAnimation, QEasingCurve, QAbstractAnimation, QSettings
)
from PyQt6.QtGui import (
    QPixmap, QColor, QPen, QBrush, QPainter, QFont, QIcon,
    QLinearGradient, QRadialGradient, QConicalGradient, QPalette,
    QKeySequence, QCursor, QMovie, QFontMetrics, QAction
)


class ModernStyle:
    """مدرن ترین استایل‌های UI"""
    
    # رنگ‌های اصلی
    PRIMARY_COLOR = "#2196F3"
    SECONDARY_COLOR = "#FFC107"
    SUCCESS_COLOR = "#4CAF50"
    WARNING_COLOR = "#FF9800"
    ERROR_COLOR = "#F44336"
    INFO_COLOR = "#00BCD4"
    
    # رنگ‌های پس‌زمینه
    DARK_BG = "#121212"
    LIGHT_BG = "#FAFAFA"
    CARD_BG = "#FFFFFF"
    SURFACE_BG = "#F5F5F5"
    
    # رنگ‌های متن
    TEXT_PRIMARY = "#212121"
    TEXT_SECONDARY = "#757575"
    TEXT_DISABLED = "#BDBDBD"
    TEXT_HINT = "#9E9E9E"
    
    @staticmethod
    def get_main_stylesheet():
        return """
        QMainWindow {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                stop:0 #f0f2f5, stop:1 #e8eef5);
            font-family: 'Segoe UI', Arial, sans-serif;
        }
        
        QWidget {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 9pt;
        }
        
        /* گروه‌ها */
        QGroupBox {
            font-weight: bold;
            border: 2px solid #e0e0e0;
            border-radius: 12px;
            margin-top: 1ex;
            padding-top: 15px;
            background: white;
        }
        
        QGroupBox::title {
            subcontrol-origin: margin;
            left: 15px;
            padding: 0 8px 0 8px;
            color: #2196F3;
            font-size: 10pt;
        }
        
        /* دکمه‌ها */
        QPushButton {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #2196F3, stop:1 #1976D2);
            border: none;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            padding: 10px 20px;
            min-height: 20px;
        }
        
        QPushButton:hover {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #42A5F5, stop:1 #2196F3);
        }
        
        QPushButton:pressed {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #1976D2, stop:1 #1565C0);
        }
        
        QPushButton:disabled {
            background: #BDBDBD;
            color: #757575;
        }
        
        /* دکمه‌های خطرناک */
        QPushButton[danger="true"] {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #F44336, stop:1 #D32F2F);
        }
        
        QPushButton[danger="true"]:hover {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #EF5350, stop:1 #F44336);
        }
        
        /* دکمه‌های موفقیت */
        QPushButton[success="true"] {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #4CAF50, stop:1 #388E3C);
        }
        
        QPushButton[success="true"]:hover {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #66BB6A, stop:1 #4CAF50);
        }
        
        /* کمبوباکس‌ها */
        QComboBox {
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 8px;
            background: white;
            min-width: 120px;
        }
        
        QComboBox:focus {
            border-color: #2196F3;
        }
        
        QComboBox::drop-down {
            border: none;
            width: 30px;
        }
        
        /* لیست‌ها */
        QListWidget {
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            background: white;
            alternate-background-color: #f5f5f5;
            outline: none;
        }
        
        QListWidget::item {
            padding: 8px;
            border-bottom: 1px solid #f0f0f0;
        }
        
        QListWidget::item:selected {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #2196F3, stop:1 #42A5F5);
            color: white;
            border-radius: 4px;
        }
        
        QListWidget::item:hover {
            background: #e3f2fd;
            border-radius: 4px;
        }
        
        /* نوار ابزار */
        QToolBar {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #ffffff, stop:1 #f5f5f5);
            border: none;
            border-bottom: 1px solid #e0e0e0;
            padding: 5px;
        }
        
        QToolBar QToolButton {
            background: transparent;
            border: none;
            border-radius: 6px;
            padding: 8px;
            margin: 2px;
        }
        
        QToolBar QToolButton:hover {
            background: #e3f2fd;
        }
        
        QToolBar QToolButton:pressed {
            background: #bbdefb;
        }
        
        /* نوار وضعیت */
        QStatusBar {
            background: #f5f5f5;
            border-top: 1px solid #e0e0e0;
            color: #666;
        }
        
        /* اسکرولبار */
        QScrollBar:vertical {
            border: none;
            background: #f5f5f5;
            width: 12px;
            border-radius: 6px;
        }
        
        QScrollBar::handle:vertical {
            background: #bdbdbd;
            border-radius: 6px;
            min-height: 20px;
        }
        
        QScrollBar::handle:vertical:hover {
            background: #9e9e9e;
        }
        
        /* تب‌ها */
        QTabWidget::pane {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            background: white;
        }
        
        QTabBar::tab {
            background: #f5f5f5;
            border: 1px solid #e0e0e0;
            padding: 10px 20px;
            margin-right: 2px;
        }
        
        QTabBar::tab:selected {
            background: white;
            border-bottom-color: white;
        }
        
        QTabBar::tab:first {
            border-top-left-radius: 8px;
            border-bottom-left-radius: 8px;
        }
        
        QTabBar::tab:last {
            border-top-right-radius: 8px;
            border-bottom-right-radius: 8px;
        }
        """

class AnimatedButton(QPushButton):
    """دکمه با انیمیشن"""
    
    def __init__(self, text="", parent=None):
        super().__init__(text, parent)
        self.animation = QPropertyAnimation(self, b"geometry")
        self.animation.setDuration(150)
        self.animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        
    def enterEvent(self, event):
        self.start_hover_animation()
        super().enterEvent(event)
        
    def leaveEvent(self, event):
        self.end_hover_animation()
        super().leaveEvent(event)
        
    def start_hover_animation(self):
        rect = self.geometry()
        self.animation.setStartValue(rect)
        new_rect = rect.adjusted(-2, -2, 2, 2)
        self.animation.setEndValue(new_rect)
        self.animation.start()
        
    def end_hover_animation(self):
        rect = self.geometry()
        self.animation.setStartValue(rect)
        new_rect = rect.adjusted(2, 2, -2, -2)
        self.animation.setEndValue(new_rect)
        self.animation.start()


class ImageCanvas(QGraphicsView):
    """کانواس پیشرفته برای نمایش و ویرایش تصاویر"""
    
    annotation_created = pyqtSignal(dict)
    annotation_selected = pyqtSignal(int)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        
        self.scene = QGraphicsScene()
        self.setScene(self.scene)
        
        # تنظیمات
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.RubberBandDrag)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        
        # متغیرها
        self.image_item = None
        self.image_pixmap = None  # اضافه شد برای نگهداری pixmap
        self.annotations = []
        self.current_annotation = None
        self.drawing = False
        self.start_point = None
        self.current_rect = None
        self.annotation_color = QColor("#FF5722")
        self.selected_color = QColor("#2196F3")
        
    def set_image(self, image_path: str):
        """تنظیم تصویر جدید"""
        try:
            pixmap = QPixmap(image_path)
            if pixmap.isNull():
                print(f"نمی‌توان تصویر را بارگذاری کرد: {image_path}")
                return False
                
            self.scene.clear()
            self.image_pixmap = pixmap  # ذخیره pixmap
            self.image_item = self.scene.addPixmap(pixmap)
            self.annotations.clear()
            
            # تنظیم اندازه صحنه
            self.scene.setSceneRect(QRectF(pixmap.rect()))
            self.fitInView(self.image_item, Qt.AspectRatioMode.KeepAspectRatio)
            
            return True
        except Exception as e:
            print(f"خطا در بارگذاری تصویر: {e}")
            return False
            
    def add_annotation(self, x1: int, y1: int, x2: int, y2: int, 
                      class_name: str, color: QColor = None):
        """افزودن حاشیه‌نویسی جدید"""
        if color is None:
            color = self.annotation_color
            
        rect = QRectF(x1, y1, x2 - x1, y2 - y1)
        
        # ایجاد مستطیل
        rect_item = self.scene.addRect(rect, QPen(color, 2), QBrush())
        
        # افزودن برچسب
        label_item = self.scene.addText(class_name, QFont("Arial", 10))
        label_item.setDefaultTextColor(color)
        label_item.setPos(x1, y1 - 20)
        
        annotation = {
            'rect_item': rect_item,
            'label_item': label_item,
            'class': class_name,
            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
            'color': color
        }
        
        self.annotations.append(annotation)
        return len(self.annotations) - 1
        
    def remove_annotation(self, index: int):
        """حذف حاشیه‌نویسی"""
        if 0 <= index < len(self.annotations):
            ann = self.annotations[index]
            self.scene.removeItem(ann['rect_item'])
            self.scene.removeItem(ann['label_item'])
            del self.annotations[index]
            
    def clear_all_annotations(self):
        """پاک کردن همه حاشیه‌نویسی‌ها از کانواس"""
        for ann in self.annotations:
            if ann['rect_item'] in self.scene.items():
                self.scene.removeItem(ann['rect_item'])
            if ann['label_item'] in self.scene.items():
                self.scene.removeItem(ann['label_item'])
        self.annotations.clear()
        
        # بازیابی تصویر
        if self.image_pixmap and self.image_item:
            self.scene.clear()
            self.image_item = self.scene.addPixmap(self.image_pixmap)
            
    def redraw_all_annotations(self, annotations_list):
        """بازرسم همه حاشیه‌نویسی‌ها"""
        self.clear_all_annotations()
        
        for ann in annotations_list:
            self.add_annotation(
                ann['x1'], ann['y1'], ann['x2'], ann['y2'],
                ann['class'], ann['color']
            )
            
    def select_annotation(self, index: int):
        """انتخاب حاشیه‌نویسی"""
        # پاک کردن انتخاب قبلی
        if self.current_annotation is not None and self.current_annotation < len(self.annotations):
            old_ann = self.annotations[self.current_annotation]
            if 'rect_item' in old_ann and old_ann['rect_item'] in self.scene.items():
                old_ann['rect_item'].setPen(QPen(old_ann['color'], 2))
            
        # انتخاب جدید
        if 0 <= index < len(self.annotations):
            self.current_annotation = index
            ann = self.annotations[index]
            if 'rect_item' in ann and ann['rect_item'] in self.scene.items():
                ann['rect_item'].setPen(QPen(self.selected_color, 3))
            
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.image_item:
            scene_pos = self.mapToScene(event.position().toPoint())
            
            # بررسی کلیک روی حاشیه‌نویسی موجود
            clicked_annotation = self.get_annotation_at_point(scene_pos)
            if clicked_annotation is not None:
                self.select_annotation(clicked_annotation)
                self.annotation_selected.emit(clicked_annotation)
                return
                
            # شروع رسم حاشیه‌نویسی جدید
            if self.scene.sceneRect().contains(scene_pos):
                self.drawing = True
                self.start_point = scene_pos
                
        super().mousePressEvent(event)
        
    def mouseMoveEvent(self, event):
        if self.drawing and self.start_point:
            scene_pos = self.mapToScene(event.position().toPoint())
            
            # حذف مستطیل موقت قبلی
            if self.current_rect:
                self.scene.removeItem(self.current_rect)
                
            # رسم مستطیل موقت جدید
            rect = QRectF(self.start_point, scene_pos).normalized()
            self.current_rect = self.scene.addRect(
                rect, QPen(QColor("#FF5722"), 2, Qt.PenStyle.DashLine), QBrush()
            )
            
        super().mouseMoveEvent(event)
        
    def mouseReleaseEvent(self, event):
        if self.drawing and self.start_point:
            scene_pos = self.mapToScene(event.position().toPoint())
            
            # حذف مستطیل موقت
            if self.current_rect:
                self.scene.removeItem(self.current_rect)
                self.current_rect = None
                
            # بررسی اندازه مناسب
            rect = QRectF(self.start_point, scene_pos).normalized()
            if rect.width() > 10 and rect.height() > 10:
                annotation_data = {
                    'x1': int(rect.x()),
                    'y1': int(rect.y()),
                    'x2': int(rect.x() + rect.width()),
                    'y2': int(rect.y() + rect.height()),
                    'class': 'object'  # کلاس پیش‌فرض
                }
                self.annotation_created.emit(annotation_data)
                
            self.drawing = False
            self.start_point = None
            
        super().mouseReleaseEvent(event)
        
    def get_annotation_at_point(self, point: QPointF) -> Optional[int]:
        """پیدا کردن حاشیه‌نویسی در نقطه مشخص"""
        for i, ann in enumerate(self.annotations):
            rect = QRectF(ann['x1'], ann['y1'], 
                         ann['x2'] - ann['x1'], ann['y2'] - ann['y1'])
            if rect.contains(point):
                return i
        return None
        
    def zoom_in(self):
        """بزرگ‌نمایی"""
        self.scale(1.25, 1.25)
        
    def zoom_out(self):
        """کوچک‌نمایی"""
        self.scale(0.8, 0.8)
        
    def fit_to_window(self):
        """تطبیق با پنجره"""
        if self.image_item:
            self.fitInView(self.image_item, Qt.AspectRatioMode.KeepAspectRatio)


class AnnotationListWidget(QListWidget):
    """لیست پیشرفته حاشیه‌نویسی‌ها"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAlternatingRowColors(True)
        self.setStyleSheet("""
            QListWidget::item {
                padding: 12px;
                border-bottom: 1px solid #e0e0e0;
                border-radius: 4px;
                margin: 2px;
            }
            QListWidget::item:selected {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #2196F3, stop:1 #42A5F5);
                color: white;
            }
            QListWidget::item:hover {
                background: #e3f2fd;
            }
        """)
        
    def add_annotation_item(self, annotation: dict, index: int):
        """افزودن آیتم حاشیه‌نویسی"""
        text = f"{annotation['class']}\n({annotation['x1']}, {annotation['y1']}) → ({annotation['x2']}, {annotation['y2']})"
        item = QListWidgetItem(text)
        item.setData(Qt.ItemDataRole.UserRole, index)
        
        # تنظیم آیکون رنگی
        pixmap = QPixmap(16, 16)
        pixmap.fill(annotation.get('color', QColor("#FF5722")))
        item.setIcon(QIcon(pixmap))
        
        self.addItem(item)


class ClassManagerDialog(QDialog):
    """دیالوگ مدیریت کلاس‌ها"""
    
    def __init__(self, parent=None, classes=None):
        super().__init__(parent)
        self.classes = classes[:] if classes else []  # کپی لیست
        self.setup_ui()
        
    def setup_ui(self):
        self.setWindowTitle("مدیریت کلاس‌ها")
        self.setModal(True)
        self.resize(500, 600)
        
        # استایل
        self.setStyleSheet(ModernStyle.get_main_stylesheet())
        
        layout = QVBoxLayout(self)
        
        # عنوان
        title = QLabel("مدیریت کلاس‌های اشیاء")
        title.setFont(QFont("Arial", 16, QFont.Weight.Bold))
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setStyleSheet("color: #2196F3; padding: 20px;")
        layout.addWidget(title)
        
        # لیست کلاس‌ها
        group = QGroupBox("کلاس‌های موجود")
        group_layout = QVBoxLayout(group)
        
        self.class_list = QListWidget()
        self.class_list.setStyleSheet("""
            QListWidget::item {
                padding: 10px;
                border-bottom: 1px solid #e0e0e0;
            }
        """)
        for cls in self.classes:
            self.class_list.addItem(cls)
        group_layout.addWidget(self.class_list)
        
        # دکمه‌های مدیریت
        buttons_layout = QHBoxLayout()
        
        up_btn = QPushButton("↑ بالا")
        up_btn.clicked.connect(self.move_up)
        buttons_layout.addWidget(up_btn)
        
        down_btn = QPushButton("↓ پایین")
        down_btn.clicked.connect(self.move_down)
        buttons_layout.addWidget(down_btn)
        
        remove_btn = QPushButton("حذف")
        remove_btn.setProperty("danger", True)
        remove_btn.clicked.connect(self.remove_class)
        buttons_layout.addWidget(remove_btn)
        
        group_layout.addLayout(buttons_layout)
        layout.addWidget(group)
        
        # افزودن کلاس جدید
        add_group = QGroupBox("افزودن کلاس جدید")
        add_layout = QHBoxLayout(add_group)
        
        self.class_input = QLineEdit()
        self.class_input.setPlaceholderText("نام کلاس را وارد کنید...")
        self.class_input.returnPressed.connect(self.add_class)
        add_layout.addWidget(self.class_input)
        
        add_btn = QPushButton("افزودن")
        add_btn.setProperty("success", True)
        add_btn.clicked.connect(self.add_class)
        add_layout.addWidget(add_btn)
        
        layout.addWidget(add_group)
        
        # کلاس‌های پیش‌فرض
        preset_group = QGroupBox("کلاس‌های پیش‌فرض")
        preset_layout = QGridLayout(preset_group)
        
        presets = [
            "person", "car", "truck", "bus", "motorcycle", "bicycle",
            "dog", "cat", "bird", "train", "boat", "airplane"
        ]
        
        for i, preset in enumerate(presets):
            btn = QPushButton(preset)
            btn.clicked.connect(lambda checked, p=preset: self.add_preset_class(p))
            preset_layout.addWidget(btn, i // 3, i % 3)
            
        layout.addWidget(preset_group)
        
        # دکمه‌های دیالوگ
        dialog_buttons = QHBoxLayout()
        
        ok_btn = QPushButton("تأیید")
        ok_btn.setProperty("success", True)
        ok_btn.clicked.connect(self.accept)
        dialog_buttons.addWidget(ok_btn)
        
        cancel_btn = QPushButton("انصراف")
        cancel_btn.clicked.connect(self.reject)
        dialog_buttons.addWidget(cancel_btn)
        
        layout.addLayout(dialog_buttons)
        
    def add_class(self):
        class_name = self.class_input.text().strip()
        if class_name and class_name not in self.classes:
            self.classes.append(class_name)
            self.class_list.addItem(class_name)
            self.class_input.clear()
            
    def add_preset_class(self, class_name):
        if class_name not in self.classes:
            self.classes.append(class_name)
            self.class_list.addItem(class_name)
            
    def remove_class(self):
        current_row = self.class_list.currentRow()
        if current_row >= 0:
            self.class_list.takeItem(current_row)
            del self.classes[current_row]
            
    def move_up(self):
        current_row = self.class_list.currentRow()
        if current_row > 0:
            item = self.class_list.takeItem(current_row)
            self.class_list.insertItem(current_row - 1, item)
            self.class_list.setCurrentRow(current_row - 1)
            
            # تغییر در لیست
            self.classes[current_row], self.classes[current_row - 1] = \
                self.classes[current_row - 1], self.classes[current_row]
                
    def move_down(self):
        current_row = self.class_list.currentRow()
        if current_row < self.class_list.count() - 1:
            item = self.class_list.takeItem(current_row)
            self.class_list.insertItem(current_row + 1, item)
            self.class_list.setCurrentRow(current_row + 1)
            
            # تغییر در لیست
            self.classes[current_row], self.classes[current_row + 1] = \
                self.classes[current_row + 1], self.classes[current_row]


class AdvancedImageLabeler(QMainWindow):
    """برنامه اصلی برچسب‌گذاری تصاویر"""
    
    def __init__(self):
        super().__init__()
        
        # متغیرهای اصلی
        self.image_files = []
        self.current_index = 0
        self.annotations = []  # حاشیه‌نویسی‌های تصویر جاری
        self.current_class = "person"
        self.classes = ["person", "car", "bike", "truck", "bus"]
        self.annotation_format = "YOLO"
        self.output_dir = ""
        self.settings = QSettings("ImageLabeler", "Advanced")
        
        self.setup_ui()
        self.setup_connections()
        self.load_settings()
        
    def setup_ui(self):
        """راه‌اندازی رابط کاربری"""
        self.setWindowTitle("Advanced Image Labeling Tool - ابزار پیشرفته برچسب‌گذاری تصاویر")
        self.setGeometry(100, 100, 1600, 1000)
        
        # اعمال استایل
        self.setStyleSheet(ModernStyle.get_main_stylesheet())
        
        # ویجت مرکزی
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # طرح‌بندی اصلی
        main_layout = QHBoxLayout(central_widget)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(10, 10, 10, 10)
        
        # تقسیم‌بندی اصلی
        splitter = QSplitter(Qt.Orientation.Horizontal)
        main_layout.addWidget(splitter)
        
        # پنل راست - کانواس تصویر
        self.create_image_panel(splitter)
        
        # پنل چپ - کنترل‌ها
# پنل چپ - کنترل‌ها
        self.create_control_panel(splitter)
        
        # تنظیم نسبت‌ها
        splitter.setSizes([1200, 400])
        
        # نوار ابزار
        self.create_toolbar()
        
        # نوار وضعیت
        self.create_statusbar()
        
        # منو
        self.create_menubar()
        
    def create_image_panel(self, parent):
        """ایجاد پنل تصویر"""
        image_frame = QFrame()
        image_frame.setFrameStyle(QFrame.Shape.StyledPanel)
        image_frame.setStyleSheet("""
            QFrame {
                background: white;
                border: 2px solid #e0e0e0;
                border-radius: 12px;
            }
        """)
        
        layout = QVBoxLayout(image_frame)
        
        # عنوان
        title = QLabel("🖼️ تصویر")
        title.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        title.setStyleSheet("color: #2196F3; padding: 10px; border: none;")
        layout.addWidget(title)
        
        # کانواس
        self.canvas = ImageCanvas()
        layout.addWidget(self.canvas)
        
        # کنترل‌های زوم
        zoom_layout = QHBoxLayout()
        
        zoom_out_btn = QPushButton("🔍-")
        zoom_out_btn.clicked.connect(self.canvas.zoom_out)
        zoom_layout.addWidget(zoom_out_btn)
        
        fit_btn = QPushButton("📐 تطبیق")
        fit_btn.clicked.connect(self.canvas.fit_to_window)
        zoom_layout.addWidget(fit_btn)
        
        zoom_in_btn = QPushButton("🔍+")
        zoom_in_btn.clicked.connect(self.canvas.zoom_in)
        zoom_layout.addWidget(zoom_in_btn)
        
        zoom_layout.addStretch()
        layout.addLayout(zoom_layout)
        
        parent.addWidget(image_frame)
        
    def create_control_panel(self, parent):
        """ایجاد پنل کنترل"""
        control_frame = QFrame()
        control_frame.setFrameStyle(QFrame.Shape.StyledPanel)
        control_frame.setStyleSheet("""
            QFrame {
                background: white;
                border: 2px solid #e0e0e0;
                border-radius: 12px;
            }
        """)
        
        layout = QVBoxLayout(control_frame)
        
        # تب‌ها
        tab_widget = QTabWidget()
        tab_widget.setStyleSheet("""
            QTabWidget::pane {
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                background: white;
            }
            QTabBar::tab {
                background: #f5f5f5;
                border: 1px solid #e0e0e0;
                padding: 12px 20px;
                margin-right: 2px;
                font-weight: bold;
            }
            QTabBar::tab:selected {
                background: white;
                border-bottom-color: white;
                color: #2196F3;
            }
        """)
        
        # تب فایل‌ها
        files_tab = self.create_files_tab()
        tab_widget.addTab(files_tab, "📁 فایل‌ها")
        
        # تب حاشیه‌نویسی‌ها
        annotations_tab = self.create_annotations_tab()
        tab_widget.addTab(annotations_tab, "🏷️ برچسب‌ها")
        
        # تب تنظیمات
        settings_tab = self.create_settings_tab()
        tab_widget.addTab(settings_tab, "⚙️ تنظیمات")
        
        layout.addWidget(tab_widget)
        parent.addWidget(control_frame)
        
    def create_files_tab(self):
        """ایجاد تب فایل‌ها"""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        
        # دکمه باز کردن پوشه
        open_btn = AnimatedButton("📂 باز کردن پوشه")
        open_btn.setProperty("success", True)
        open_btn.clicked.connect(self.open_folder)
        layout.addWidget(open_btn)
        
        # لیست فایل‌ها
        files_group = QGroupBox("لیست تصاویر")
        files_layout = QVBoxLayout(files_group)
        
        self.files_list = QListWidget()
        self.files_list.setStyleSheet("""
            QListWidget::item {
                padding: 8px;
                border-bottom: 1px solid #f0f0f0;
            }
            QListWidget::item:selected {
                background: #2196F3;
                color: white;
            }
        """)
        files_layout.addWidget(self.files_list)
        
        # کنترل‌های ناوبری
        nav_layout = QHBoxLayout()
        
        self.prev_btn = QPushButton("⬅️ قبلی")
        self.prev_btn.clicked.connect(self.previous_image)
        nav_layout.addWidget(self.prev_btn)
        
        self.next_btn = QPushButton("➡️ بعدی")
        self.next_btn.clicked.connect(self.next_image)
        nav_layout.addWidget(self.next_btn)
        
        files_layout.addLayout(nav_layout)
        
        # شمارنده
        self.counter_label = QLabel("0 / 0")
        self.counter_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.counter_label.setStyleSheet("""
            QLabel {
                background: #f5f5f5;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                padding: 8px;
                font-weight: bold;
            }
        """)
        files_layout.addWidget(self.counter_label)
        
        layout.addWidget(files_group)
        return widget
        
    def create_annotations_tab(self):
        """ایجاد تب حاشیه‌نویسی‌ها"""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        
        # انتخاب کلاس
        class_group = QGroupBox("انتخاب کلاس")
        class_layout = QVBoxLayout(class_group)
        
        self.class_combo = QComboBox()
        self.class_combo.addItems(self.classes)
        self.class_combo.currentTextChanged.connect(self.on_class_changed)
        class_layout.addWidget(self.class_combo)
        
        # دکمه مدیریت کلاس‌ها
        manage_classes_btn = QPushButton("📝 مدیریت کلاس‌ها")
        manage_classes_btn.clicked.connect(self.manage_classes)
        class_layout.addWidget(manage_classes_btn)
        
        layout.addWidget(class_group)
        
        # لیست حاشیه‌نویسی‌ها
        ann_group = QGroupBox("برچسب‌های موجود")
        ann_layout = QVBoxLayout(ann_group)
        
        self.annotations_list = AnnotationListWidget()
        self.annotations_list.itemClicked.connect(self.on_annotation_selected)
        ann_layout.addWidget(self.annotations_list)
        
        # دکمه‌های مدیریت
        ann_buttons = QHBoxLayout()
        
        delete_btn = QPushButton("🗑️ حذف")
        delete_btn.setProperty("danger", True)
        delete_btn.clicked.connect(self.delete_annotation)
        ann_buttons.addWidget(delete_btn)
        
        clear_btn = QPushButton("🧹 پاک کردن همه")
        clear_btn.setProperty("danger", True)
        clear_btn.clicked.connect(self.clear_annotations)
        ann_buttons.addWidget(clear_btn)
        
        ann_layout.addLayout(ann_buttons)
        layout.addWidget(ann_group)
        
        return widget
        
    def create_settings_tab(self):
        """ایجاد تب تنظیمات"""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        
        # فرمت خروجی
        format_group = QGroupBox("فرمت خروجی")
        format_layout = QVBoxLayout(format_group)
        
        self.format_combo = QComboBox()
        self.format_combo.addItems(["YOLO", "Pascal VOC", "COCO", "CSV"])
        self.format_combo.setCurrentText(self.annotation_format)
        self.format_combo.currentTextChanged.connect(self.on_format_changed)
        format_layout.addWidget(self.format_combo)
        
        layout.addWidget(format_group)
        
        # مسیر خروجی
        output_group = QGroupBox("مسیر خروجی")
        output_layout = QVBoxLayout(output_group)
        
        self.output_label = QLabel("انتخاب نشده")
        self.output_label.setStyleSheet("""
            QLabel {
                background: #f5f5f5;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                padding: 8px;
            }
        """)
        output_layout.addWidget(self.output_label)
        
        output_btn = QPushButton("📁 انتخاب مسیر")
        output_btn.clicked.connect(self.select_output_dir)
        output_layout.addWidget(output_btn)
        
        layout.addWidget(output_group)
        
        # ذخیره و بارگذاری
        save_group = QGroupBox("ذخیره و بارگذاری")
        save_layout = QVBoxLayout(save_group)
        
        save_btn = QPushButton("💾 ذخیره برچسب‌ها")
        save_btn.setProperty("success", True)
        save_btn.clicked.connect(self.save_annotations)
        save_layout.addWidget(save_btn)
        
        export_btn = QPushButton("📤 صادرات همه")
        export_btn.clicked.connect(self.export_all)
        save_layout.addWidget(export_btn)
        
        layout.addWidget(save_group)
        
        layout.addStretch()
        return widget
        
    def create_toolbar(self):
        """ایجاد نوار ابزار"""
        toolbar = QToolBar("نوار ابزار اصلی")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        
        # دکمه‌های اصلی
        open_action = QAction("📂", self)
        open_action.triggered.connect(self.open_folder)
        open_action.setToolTip("باز کردن پوشه")
        toolbar.addAction(open_action)
        
        toolbar.addSeparator()
        
        prev_action = QAction("⬅️", self)
        prev_action.triggered.connect(self.previous_image)
        prev_action.setToolTip("تصویر قبلی")
        toolbar.addAction(prev_action)
        
        next_action = QAction("➡️", self)
        next_action.triggered.connect(self.next_image)
        next_action.setToolTip("تصویر بعدی")
        toolbar.addAction(next_action)
        
        toolbar.addSeparator()
        
        zoom_in_action = QAction("🔍+", self)
        zoom_in_action.triggered.connect(self.canvas.zoom_in)
        zoom_in_action.setToolTip("بزرگ‌نمایی")
        toolbar.addAction(zoom_in_action)
        
        zoom_out_action = QAction("🔍-", self)
        zoom_out_action.triggered.connect(self.canvas.zoom_out)
        zoom_out_action.setToolTip("کوچک‌نمایی")
        toolbar.addAction(zoom_out_action)
        
        fit_action = QAction("📐", self)
        fit_action.triggered.connect(self.canvas.fit_to_window)
        fit_action.setToolTip("تطبیق با پنجره")
        toolbar.addAction(fit_action)
        
        toolbar.addSeparator()
        
        save_action = QAction("💾", self)
        save_action.triggered.connect(self.save_annotations)
        save_action.setToolTip("ذخیره")
        toolbar.addAction(save_action)
        
    def create_statusbar(self):
        """ایجاد نوار وضعیت"""
        statusbar = QStatusBar()
        self.setStatusBar(statusbar)
        
        self.status_label = QLabel("آماده - یک پوشه انتخاب کنید")
        statusbar.addWidget(self.status_label)
        
        # پیشرفت
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        statusbar.addPermanentWidget(self.progress_bar)
        
    def create_menubar(self):
        """ایجاد نوار منو"""
        menubar = self.menuBar()
        
        # منوی فایل
        file_menu = menubar.addMenu("📁 فایل")
        
        open_action = QAction("باز کردن پوشه", self)
        open_action.setShortcut(QKeySequence.StandardKey.Open)
        open_action.triggered.connect(self.open_folder)
        file_menu.addAction(open_action)
        
        file_menu.addSeparator()
        
        save_action = QAction("ذخیره", self)
        save_action.setShortcut(QKeySequence.StandardKey.Save)
        save_action.triggered.connect(self.save_annotations)
        file_menu.addAction(save_action)
        
        export_action = QAction("صادرات همه", self)
        export_action.triggered.connect(self.export_all)
        file_menu.addAction(export_action)
        
        file_menu.addSeparator()
        
        quit_action = QAction("خروج", self)
        quit_action.setShortcut(QKeySequence.StandardKey.Quit)
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)
        
        # منوی ویرایش
        edit_menu = menubar.addMenu("✏️ ویرایش")
        
        delete_action = QAction("حذف انتخاب شده", self)
        delete_action.setShortcut(QKeySequence.StandardKey.Delete)
        delete_action.triggered.connect(self.delete_annotation)
        edit_menu.addAction(delete_action)
        
        clear_action = QAction("پاک کردن همه", self)
        clear_action.triggered.connect(self.clear_annotations)
        edit_menu.addAction(clear_action)
        
        # منوی نمایش
        view_menu = menubar.addMenu("👁️ نمایش")
        
        zoom_in_action = QAction("بزرگ‌نمایی", self)
        zoom_in_action.setShortcut(QKeySequence("Ctrl++"))
        zoom_in_action.triggered.connect(self.canvas.zoom_in)
        view_menu.addAction(zoom_in_action)
        
        zoom_out_action = QAction("کوچک‌نمایی", self)
        zoom_out_action.setShortcut(QKeySequence("Ctrl+-"))
        zoom_out_action.triggered.connect(self.canvas.zoom_out)
        view_menu.addAction(zoom_out_action)
        
        fit_action = QAction("تطبیق با پنجره", self)
        fit_action.setShortcut(QKeySequence("Ctrl+0"))
        fit_action.triggered.connect(self.canvas.fit_to_window)
        view_menu.addAction(fit_action)
        
        # منوی ابزارها
        tools_menu = menubar.addMenu("🛠️ ابزارها")
        
        manage_action = QAction("مدیریت کلاس‌ها", self)
        manage_action.triggered.connect(self.manage_classes)
        tools_menu.addAction(manage_action)
        
        # منوی راهنما
        help_menu = menubar.addMenu("❓ راهنما")
        
        about_action = QAction("درباره برنامه", self)
        about_action.triggered.connect(self.show_about)
        help_menu.addAction(about_action)
        
    def setup_connections(self):
        """راه‌اندازی اتصالات"""
        self.canvas.annotation_created.connect(self.on_annotation_created)
        self.canvas.annotation_selected.connect(self.on_annotation_selected_canvas)
        self.files_list.itemClicked.connect(self.on_file_selected)
        
    def open_folder(self):
        """باز کردن پوشه تصاویر"""
        folder = QFileDialog.getExistingDirectory(self, "انتخاب پوشه تصاویر")
        if folder:
            self.load_images_from_folder(folder)
            
    def load_images_from_folder(self, folder_path: str):
        """بارگذاری تصاویر از پوشه"""
        extensions = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.gif')
        self.image_files = []
        
        folder = Path(folder_path)
        
        # استفاده از set برای جلوگیری از تکرار
        image_set = set()
        
        for ext in extensions:
            # جستجوی حروف کوچک
            image_set.update(folder.glob(f"*{ext}"))
            # جستجوی حروف بزرگ
            image_set.update(folder.glob(f"*{ext.upper()}"))
        
        self.image_files = sorted(list(image_set))
        
        if self.image_files:
            self.current_index = 0
            self.update_files_list()
            self.load_current_image()
            self.status_label.setText(f"{len(self.image_files)} تصویر بارگذاری شد")
        else:
            QMessageBox.warning(self, "هشدار", "هیچ تصویری در پوشه انتخاب شده پیدا نشد!")
            
    def update_files_list(self):
        """به‌روزرسانی لیست فایل‌ها"""
        self.files_list.clear()
        for i, file_path in enumerate(self.image_files):
            item = QListWidgetItem(f"📷 {file_path.name}")
            if i == self.current_index:
                item.setSelected(True)
            self.files_list.addItem(item)
            
        self.counter_label.setText(f"{self.current_index + 1} / {len(self.image_files)}")
        
    def load_current_image(self):
        """بارگذاری تصویر جاری"""
        if not self.image_files:
            return
            
        image_path = str(self.image_files[self.current_index])
        
        if self.canvas.set_image(image_path):
            self.load_existing_annotations(image_path)
            self.update_canvas_annotations()
            self.update_annotations_list()
            self.status_label.setText(f"تصویر بارگذاری شد: {Path(image_path).name}")
        else:
            QMessageBox.critical(self, "خطا", "نمی‌توان تصویر را بارگذاری کرد!")
            
    def load_existing_annotations(self, image_path: str):
        """بارگذاری حاشیه‌نویسی‌های موجود"""
        self.annotations.clear()
        
        # بر اساس فرمت انتخاب شده
        if self.annotation_format == "YOLO":
            self.load_yolo_annotations(image_path)
        elif self.annotation_format == "Pascal VOC":
            self.load_pascal_voc_annotations(image_path)
        elif self.annotation_format == "CSV":
            self.load_csv_annotations(image_path)
            
    def load_yolo_annotations(self, image_path: str):
        """بارگذاری حاشیه‌نویسی‌های YOLO"""
        txt_path = Path(image_path).with_suffix('.txt')
        
        # اگر مسیر خروجی تنظیم شده، از آنجا بخوان
        if self.output_dir:
            txt_path = Path(self.output_dir) / txt_path.name
        
        # در غیر این صورت از کنار فایل تصویر
        if not txt_path.exists():
            txt_path = Path(image_path).with_suffix('.txt')
            
        if txt_path.exists():
            # دریافت اندازه تصویر
            try:
                pixmap = QPixmap(image_path)
                if pixmap.isNull():
                    return
                    
                img_width, img_height = pixmap.width(), pixmap.height()
                
                with open(txt_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                            
                        parts = line.split()
                        if len(parts) == 5:
                            try:
                                class_id, center_x, center_y, width, height = map(float, parts)
                                
                                # تبدیل به مختصات مطلق
                                x1 = int((center_x - width/2) * img_width)
                                y1 = int((center_y - height/2) * img_height)
                                x2 = int((center_x + width/2) * img_width)
                                y2 = int((center_y + height/2) * img_height)
                                
                                # اطمینان از اینکه مختصات در محدوده تصویر هستند
                                x1 = max(0, min(x1, img_width))
                                y1 = max(0, min(y1, img_height))
                                x2 = max(0, min(x2, img_width))
                                y2 = max(0, min(y2, img_height))
                                
                                # دریافت نام کلاس
                                class_name = self.classes[int(class_id)] if int(class_id) < len(self.classes) else "unknown"
                                
                                self.annotations.append({
                                    'class': class_name,
                                    'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                                    'color': QColor("#FF5722")
                                })
                            except (ValueError, IndexError) as e:
                                print(f"خطا در پردازش خط: {line} - {e}")
                                continue
                                
            except Exception as e:
                print(f"خطا در بارگذاری حاشیه‌نویسی‌ها: {e}")
                
    def load_pascal_voc_annotations(self, image_path: str):
        """بارگذاری حاشیه‌نویسی‌های Pascal VOC"""
        xml_path = Path(image_path).with_suffix('.xml')
        
        # اگر مسیر خروجی تنظیم شده، از آنجا بخوان
        if self.output_dir:
            xml_path = Path(self.output_dir) / xml_path.name
            
        # در غیر این صورت از کنار فایل تصویر
        if not xml_path.exists():
            xml_path = Path(image_path).with_suffix('.xml')
            
        if xml_path.exists():
            try:
                tree = ET.parse(xml_path)
                root = tree.getroot()
                
                for obj in root.findall('object'):
                    name_elem = obj.find('name')
                    bbox_elem = obj.find('bndbox')
                    
                    if name_elem is None or bbox_elem is None:
                        continue
                        
                    class_name = name_elem.text
                    
                    xmin_elem = bbox_elem.find('xmin')
                    ymin_elem = bbox_elem.find('ymin')
                    xmax_elem = bbox_elem.find('xmax')
                    ymax_elem = bbox_elem.find('ymax')
                    
                    if None in [xmin_elem, ymin_elem, xmax_elem, ymax_elem]:
                        continue
                        
                    try:
                        x1 = int(float(xmin_elem.text))
                        y1 = int(float(ymin_elem.text))
                        x2 = int(float(xmax_elem.text))
                        y2 = int(float(ymax_elem.text))
                        
                        self.annotations.append({
                            'class': class_name,
                            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                            'color': QColor("#FF5722")
                        })
                    except ValueError as e:
                        print(f"خطا در پردازش bbox: {e}")
                        continue
                        
            except Exception as e:
                print(f"خطا در بارگذاری XML: {e}")
                
    def load_csv_annotations(self, image_path: str):
        """بارگذاری حاشیه‌نویسی‌های CSV"""
        csv_path = Path(image_path).with_suffix('.csv')
        
        # اگر مسیر خروجی تنظیم شده، از آنجا بخوان
        if self.output_dir:
            csv_path = Path(self.output_dir) / csv_path.name
            
        # در غیر این صورت از کنار فایل تصویر
        if not csv_path.exists():
            csv_path = Path(image_path).with_suffix('.csv')
            
        if csv_path.exists():
            try:
                with open(csv_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        if 'filename' in row and row['filename'] == Path(image_path).name:
                            try:
                                self.annotations.append({
                                    'class': row.get('class', 'unknown'),
                                    'x1': int(float(row['x1'])), 
                                    'y1': int(float(row['y1'])),
                                    'x2': int(float(row['x2'])), 
                                    'y2': int(float(row['y2'])),
                                    'color': QColor("#FF5722")
                                })
                            except (ValueError, KeyError) as e:
                                print(f"خطا در پردازش CSV row: {e}")
                                continue
                                
            except Exception as e:
                print(f"خطا در بارگذاری CSV: {e}")
                
    def update_canvas_annotations(self):
        """به‌روزرسانی حاشیه‌نویسی‌های کانواس"""
        self.canvas.clear_all_annotations()
        for ann in self.annotations:
            self.canvas.add_annotation(
                ann['x1'], ann['y1'], ann['x2'], ann['y2'],
                ann['class'], ann.get('color', QColor("#FF5722"))
            ) 
                
    def update_annotations_list(self):
        """به‌روزرسانی لیست حاشیه‌نویسی‌ها"""
        self.annotations_list.clear()
        for i, ann in enumerate(self.annotations):
            self.annotations_list.add_annotation_item(ann, i)
    def on_annotation_created(self, annotation_data: dict):
        annotation_data['class'] = self.current_class
        annotation_data['color'] = QColor("#FF5722")
        
        self.annotations.append(annotation_data)
        
        # افزودن به کانواس
        self.canvas.add_annotation(
            annotation_data['x1'], annotation_data['y1'],
            annotation_data['x2'], annotation_data['y2'],
            annotation_data['class'], annotation_data['color']
        )
        
        self.update_annotations_list()
        
    def on_annotation_selected_canvas(self, index: int):
        """انتخاب حاشیه‌نویسی از کانواس"""
        if 0 <= index < self.annotations_list.count():
            self.annotations_list.setCurrentRow(index)
            
    def on_annotation_selected(self, item: QListWidgetItem):
        """انتخاب حاشیه‌نویسی از لیست"""
        index = item.data(Qt.ItemDataRole.UserRole)
        if index is not None:
            self.canvas.select_annotation(index)
            
    def on_file_selected(self, item: QListWidgetItem):
        """انتخاب فایل از لیست"""
        row = self.files_list.row(item)
        if row != self.current_index and 0 <= row < len(self.image_files):
            self.save_annotations()  # ذخیره خودکار
            self.current_index = row
            self.load_current_image()
            self.update_files_list()
            
    def on_class_changed(self, class_name: str):
        """تغییر کلاس انتخاب شده"""
        self.current_class = class_name
        
    def on_format_changed(self, format_name: str):
        """تغییر فرمت خروجی"""
        self.annotation_format = format_name
        # بارگذاری مجدد حاشیه‌نویسی‌ها با فرمت جدید
        if self.image_files:
            self.load_current_image()
        
    def previous_image(self):
        """تصویر قبلی"""
        if self.image_files and self.current_index > 0:
            self.save_annotations()
            self.current_index -= 1
            self.load_current_image()
            self.update_files_list()
            
    def next_image(self):
        """تصویر بعدی"""
        if self.image_files and self.current_index < len(self.image_files) - 1:
            self.save_annotations()
            self.current_index += 1
            self.load_current_image()
            self.update_files_list()
            
    def delete_annotation(self):
        """حذف حاشیه‌نویسی انتخاب شده"""
        current_row = self.annotations_list.currentRow()
        if current_row >= 0 and current_row < len(self.annotations):
            # حذف از لیست
            del self.annotations[current_row]
            
            # حذف از کانواس
            self.canvas.remove_annotation(current_row)
            
            # به‌روزرسانی کانواس و لیست
            self.update_canvas_annotations()
            self.update_annotations_list()
            
    def clear_annotations(self):
        """پاک کردن همه حاشیه‌نویسی‌ها"""
        reply = QMessageBox.question(
            self, "تأیید", "آیا مطمئن هستید که می‌خواهید همه برچسب‌ها را پاک کنید؟",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            self.annotations.clear()
            self.canvas.clear_all_annotations()
            self.update_annotations_list()
            
    def manage_classes(self):
        """مدیریت کلاس‌ها"""
        dialog = ClassManagerDialog(self, self.classes)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            self.classes = dialog.classes[:]
            self.class_combo.clear()
            self.class_combo.addItems(self.classes)
            if self.classes:
                self.current_class = self.classes[0]
                
    def select_output_dir(self):
        """انتخاب مسیر خروجی"""
        directory = QFileDialog.getExistingDirectory(self, "انتخاب مسیر خروجی")
        if directory:
            self.output_dir = directory
            self.output_label.setText(f"📁 {directory}")
            
    def save_annotations(self):
        """ذخیره حاشیه‌نویسی‌ها"""
        if not self.image_files or not self.annotations:
            return
            
        image_path = self.image_files[self.current_index]
        
        try:
            if self.annotation_format == "YOLO":
                self.save_yolo_format(image_path)
            elif self.annotation_format == "Pascal VOC":
                self.save_pascal_voc_format(image_path)
            elif self.annotation_format == "COCO":
                self.save_coco_format(image_path)
            elif self.annotation_format == "CSV":
                self.save_csv_format(image_path)
                
            self.status_label.setText("برچسب‌ها ذخیره شدند ✅")
        except Exception as e:
            QMessageBox.critical(self, "خطا", f"خطا در ذخیره: {str(e)}")
            
    def save_yolo_format(self, image_path: Path):
        """ذخیره در فرمت YOLO"""
        output_path = image_path.with_suffix('.txt')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        # اطمینان از وجود مسیر
        output_path.parent.mkdir(parents=True, exist_ok=True)
            
        # دریافت اندازه تصویر
        pixmap = QPixmap(str(image_path))
        if pixmap.isNull():
            return
            
        img_width, img_height = pixmap.width(), pixmap.height()
        
        with open(output_path, 'w', encoding='utf-8') as f:
            for ann in self.annotations:
                try:
                    class_id = self.classes.index(ann['class']) if ann['class'] in self.classes else 0
                    
                    center_x = ((ann['x1'] + ann['x2']) / 2) / img_width
                    center_y = ((ann['y1'] + ann['y2']) / 2) / img_height
                    width = (ann['x2'] - ann['x1']) / img_width
                    height = (ann['y2'] - ann['y1']) / img_height
                    
                    f.write(f"{class_id} {center_x:.6f} {center_y:.6f} {width:.6f} {height:.6f}\n")
                except Exception as e:
                    print(f"خطا در ذخیره annotation: {e}")
                    continue
                
    def save_pascal_voc_format(self, image_path: Path):
        """ذخیره در فرمت Pascal VOC"""
        output_path = image_path.with_suffix('.xml')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        # اطمینان از وجود مسیر
        output_path.parent.mkdir(parents=True, exist_ok=True)
            
        # دریافت اندازه تصویر
        pixmap = QPixmap(str(image_path))
        if pixmap.isNull():
            return
            
        img_width, img_height = pixmap.width(), pixmap.height()
        
        # ایجاد XML
        annotation = ET.Element('annotation')
        
        folder = ET.SubElement(annotation, 'folder')
        folder.text = str(image_path.parent.name)
        
        filename = ET.SubElement(annotation, 'filename')
        filename.text = image_path.name
        
        size = ET.SubElement(annotation, 'size')
        ET.SubElement(size, 'width').text = str(img_width)
        ET.SubElement(size, 'height').text = str(img_height)
        ET.SubElement(size, 'depth').text = '3'
        
        for ann in self.annotations:
            obj = ET.SubElement(annotation, 'object')
            ET.SubElement(obj, 'name').text = ann['class']
            ET.SubElement(obj, 'pose').text = 'Unspecified'
            ET.SubElement(obj, 'truncated').text = '0'
            ET.SubElement(obj, 'difficult').text = '0'
            
            bndbox = ET.SubElement(obj, 'bndbox')
            ET.SubElement(bndbox, 'xmin').text = str(ann['x1'])
            ET.SubElement(bndbox, 'ymin').text = str(ann['y1'])
            ET.SubElement(bndbox, 'xmax').text = str(ann['x2'])
            ET.SubElement(bndbox, 'ymax').text = str(ann['y2'])
            
        # نوشتن فایل
        xml_str = minidom.parseString(ET.tostring(annotation)).toprettyxml(indent="  ")
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(xml_str)
            
    def save_coco_format(self, image_path: Path):
        """ذخیره در فرمت COCO"""
        output_path = image_path.with_suffix('.json')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        # اطمینان از وجود مسیر
        output_path.parent.mkdir(parents=True, exist_ok=True)
            
        # دریافت اندازه تصویر
        pixmap = QPixmap(str(image_path))
        if pixmap.isNull():
            return
            
        img_width, img_height = pixmap.width(), pixmap.height()
        
        coco_data = {
            "images": [{
                "id": 1,
                "file_name": image_path.name,
                "width": img_width,
                "height": img_height
            }],
            "annotations": [],
            "categories": [{"id": i+1, "name": name} for i, name in enumerate(self.classes)]
        }
        
        for i, ann in enumerate(self.annotations):
            class_id = self.classes.index(ann['class']) + 1 if ann['class'] in self.classes else 1
            
            coco_ann = {
                "id": i + 1,
                "image_id": 1,
                "category_id": class_id,
                "bbox": [ann['x1'], ann['y1'], ann['x2'] - ann['x1'], ann['y2'] - ann['y1']],
                "area": (ann['x2'] - ann['x1']) * (ann['y2'] - ann['y1']),
                "iscrowd": 0
            }
            coco_data["annotations"].append(coco_ann)
            
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(coco_data, f, indent=2, ensure_ascii=False)
            
    def save_csv_format(self, image_path: Path):
        """ذخیره در فرمت CSV"""
        output_path = image_path.with_suffix('.csv')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        # اطمینان از وجود مسیر
        output_path.parent.mkdir(parents=True, exist_ok=True)
            
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['filename', 'class', 'x1', 'y1', 'x2', 'y2'])
            
            for ann in self.annotations:
                writer.writerow([
                    image_path.name, ann['class'],
                    ann['x1'], ann['y1'], ann['x2'], ann['y2']
                ])
                
    def export_all(self):
        """صادرات همه حاشیه‌نویسی‌ها"""
        if not self.image_files:
            QMessageBox.warning(self, "هشدار", "ابتدا تصاویری را بارگذاری کنید!")
            return
            
        if not self.output_dir:
            self.select_output_dir()
            if not self.output_dir:
                return
                
        # نوار پیشرفت
        self.progress_bar.setVisible(True)
        self.progress_bar.setMaximum(len(self.image_files))
        
        success_count = 0
        
        for i, image_path in enumerate(self.image_files):
            try:
                # بارگذاری تصویر
                original_index = self.current_index
                self.current_index = i
                self.load_current_image()
                
                if self.annotations:
                    self.save_annotations()
                    success_count += 1
                    
                self.progress_bar.setValue(i + 1)
                QApplication.processEvents()
                
            except Exception as e:
                print(f"خطا در پردازش {image_path}: {e}")
                
        # بازگردانی تصویر اصلی
        self.current_index = original_index
        self.load_current_image()
        
        self.progress_bar.setVisible(False)
        
        QMessageBox.information(
            self, "اتمام صادرات",
            f"صادرات با موفقیت انجام شد!\n{success_count} فایل پردازش شد."
        )
        
    def show_about(self):
        """نمایش درباره برنامه"""
        QMessageBox.about(
            self, "درباره برنامه",
            """
            <h2>ابزار پیشرفته برچسب‌گذاری تصاویر</h2>
            <p><b>نسخه:</b> 2.0</p>
            <p><b>سازنده:</b> Claude Sonnet 4</p>
            <p><b>توضیحات:</b> ابزاری قدرتمند و زیبا برای برچسب‌گذاری اشیاء در تصاویر</p>
            
            <h3>ویژگی‌ها:</h3>
            <ul>
                <li>رابط کاربری مدرن و زیبا</li>
                <li>پشتیبانی از فرمت‌های YOLO، Pascal VOC، COCO و CSV</li>
                <li>کنترل‌های زوم و ناوبری پیشرفته</li>
                <li>مدیریت کلاس‌ها</li>
                <li>ذخیره خودکار</li>
                <li>صادرات دسته‌ای</li>
            </ul>
            
            <p><i>با آرزوی موفقیت در پروژه‌های یادگیری ماشین شما!</i></p>
            """
        )
        
    def load_settings(self):
        """بارگذاری تنظیمات"""
        try:
            self.classes = self.settings.value("classes", self.classes)
            self.annotation_format = self.settings.value("format", self.annotation_format)
            self.output_dir = self.settings.value("output_dir", self.output_dir)
            
            # به‌روزرسانی UI
            self.class_combo.clear()
            self.class_combo.addItems(self.classes)
            self.format_combo.setCurrentText(self.annotation_format)
            if self.output_dir:
                self.output_label.setText(f"📁 {self.output_dir}")
        except Exception as e:
            print(f"خطا در بارگذاری تنظیمات: {e}")
            
    def save_settings(self):
        """ذخیره تنظیمات"""
        try:
            self.settings.setValue("classes", self.classes)
            self.settings.setValue("format", self.annotation_format)
            self.settings.setValue("output_dir", self.output_dir)
        except Exception as e:
            print(f"خطا در ذخیره تنظیمات: {e}")
        
    def closeEvent(self, event):
        """مدیریت بستن برنامه"""
        try:
            self.save_annotations()
            self.save_settings()
        except Exception as e:
            print(f"خطا در بستن برنامه: {e}")
        finally:
            event.accept()
        
    def keyPressEvent(self, event):
        """مدیریت کلیدهای میانبر"""
        try:
            if event.key() == Qt.Key.Key_Left:
                self.previous_image()
            elif event.key() == Qt.Key.Key_Right:
                self.next_image()
            elif event.key() == Qt.Key.Key_Delete:
                self.delete_annotation()
            elif event.key() == Qt.Key.Key_Escape:
                self.clear_annotations()
            elif event.key() == Qt.Key.Key_Plus or event.key() == Qt.Key.Key_Equal:
                self.canvas.zoom_in()
            elif event.key() == Qt.Key.Key_Minus:
                self.canvas.zoom_out()
            elif event.key() == Qt.Key.Key_0:
                self.canvas.fit_to_window()
            else:
                super().keyPressEvent(event)
        except Exception as e:
            print(f"خطا در پردازش کلید: {e}")
            super().keyPressEvent(event)


def main():
    """تابع اصلی"""
    try:
        app = QApplication(sys.argv)
        
        # تنظیم فونت
        font = QFont("Segoe UI", 9)
        app.setFont(font)
        
        # تنظیم نام برنامه
        app.setApplicationName("Advanced Image Labeler")
        app.setApplicationVersion("2.0")
        app.setOrganizationName("AI Tools")
        
        # ایجاد پنجره اصلی
        window = AdvancedImageLabeler()
        window.show()
        
        # اجرای برنامه
        sys.exit(app.exec())
        
    except Exception as e:
        print(f"خطای کلی در برنامه: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()