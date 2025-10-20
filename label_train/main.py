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
from collections import OrderedDict
import time
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
    QKeySequence, QCursor, QMovie, QFontMetrics, QAction, QPainterPath,
    QActionGroup, QImage  
)



class ModernStyle:
    """Modern UI Styles"""
    
    # Primary colors
    PRIMARY_COLOR = "#2196F3"
    SECONDARY_COLOR = "#FFC107"
    SUCCESS_COLOR = "#4CAF50"
    WARNING_COLOR = "#FF9800"
    ERROR_COLOR = "#F44336"
    INFO_COLOR = "#00BCD4"
    
    # Background colors
    DARK_BG = "#121212"
    LIGHT_BG = "#FAFAFA"
    CARD_BG = "#FFFFFF"
    SURFACE_BG = "#F5F5F5"
    
    # Text colors
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
        
        /* Group boxes */
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
        
        /* Buttons */
        QPushButton {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 rgba(255, 255, 255, 250),
                stop:1 rgba(245, 250, 255, 240));
            border: 2px solid rgba(33, 150, 243, 150);
            border-radius: 10px;
            color: #1976D2;
            font-weight: bold;
            padding: 12px 15px;
            text-align: left;
            font-size: 10pt;
        }
        
        QPushButton:hover {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 rgba(227, 242, 253, 255),
                stop:1 rgba(187, 222, 251, 240));
            border: 2px solid rgba(33, 150, 243, 200);
            color: #0D47A1;
        }
        
        QPushButton:pressed {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 rgba(187, 222, 251, 255),
                stop:1 rgba(144, 202, 249, 240));
            border: 2px solid rgba(33, 150, 243, 250);
            color: #0D47A1;
        }
        
        QPushButton:disabled {
            background: #BDBDBD;
            color: #757575;
        }
        
        /* Danger buttons */
        QPushButton[danger="true"] {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #F44336, stop:1 #D32F2F);
        }
        
        QPushButton[danger="true"]:hover {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #EF5350, stop:1 #F44336);
        }
        
        /* Success buttons */
        QPushButton[success="true"] {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #4CAF50, stop:1 #388E3C);
        }
        
        QPushButton[success="true"]:hover {
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #66BB6A, stop:1 #4CAF50);
        }
        
        /* Combo boxes */
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
        
        /* Lists */
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
        
        /* Toolbar */
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
        
        /* Status bar */
        QStatusBar {
            background: #f5f5f5;
            border-top: 1px solid #e0e0e0;
            color: #666;
        }
        
        /* Scrollbar */
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
        
        /* Tabs */
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
    @staticmethod
    def get_themes():
        return {
            "Blue Ocean": {
                "primary": "#2196F3",
                "secondary": "#03A9F4",
                "accent": "#00BCD4",
                "bg_gradient_start": "#f0f2f5",
                "bg_gradient_end": "#e8eef5",
                "card_bg": "#FFFFFF",
                "text_primary": "#212121",
                "text_secondary": "#757575"
            },
            "Sunset Orange": {
                "primary": "#FF6B35",
                "secondary": "#FF9F1C",
                "accent": "#FFD23F",
                "bg_gradient_start": "#FFF5E6",
                "bg_gradient_end": "#FFE8CC",
                "card_bg": "#FFFFFF",
                "text_primary": "#2C1810",
                "text_secondary": "#8B5A3C"
            },
            "Forest Green": {
                "primary": "#27AE60",
                "secondary": "#2ECC71",
                "accent": "#52D681",
                "bg_gradient_start": "#E8F8F5",
                "bg_gradient_end": "#D5F4E6",
                "card_bg": "#FFFFFF",
                "text_primary": "#1E3A28",
                "text_secondary": "#4A7C59"
            },
            "Purple Dream": {
                "primary": "#9B59B6",
                "secondary": "#8E44AD",
                "accent": "#C39BD3",
                "bg_gradient_start": "#F4ECF7",
                "bg_gradient_end": "#EBDEF0",
                "card_bg": "#FFFFFF",
                "text_primary": "#4A235A",
                "text_secondary": "#76448A"
            },
            "Ruby Red": {
                "primary": "#E74C3C",
                "secondary": "#C0392B",
                "accent": "#EC7063",
                "bg_gradient_start": "#FADBD8",
                "bg_gradient_end": "#F5B7B1",
                "card_bg": "#FFFFFF",
                "text_primary": "#641E16",
                "text_secondary": "#943126"
            },
            "Dark Mode": {
                "primary": "#BB86FC",
                "secondary": "#3700B3",
                "accent": "#03DAC6",
                "bg_gradient_start": "#1E1E1E",
                "bg_gradient_end": "#121212",
                "card_bg": "#2C2C2C",
                "text_primary": "#E1E1E1",
                "text_secondary": "#B0B0B0"
            },
            "Ocean Teal": {
                "primary": "#00897B",
                "secondary": "#00ACC1",
                "accent": "#26C6DA",
                "bg_gradient_start": "#E0F2F1",
                "bg_gradient_end": "#B2DFDB",
                "card_bg": "#FFFFFF",
                "text_primary": "#004D40",
                "text_secondary": "#00695C"
            },
            "Sakura Pink": {
                "primary": "#E91E63",
                "secondary": "#F06292",
                "accent": "#F8BBD0",
                "bg_gradient_start": "#FCE4EC",
                "bg_gradient_end": "#F8BBD0",
                "card_bg": "#FFFFFF",
                "text_primary": "#880E4F",
                "text_secondary": "#AD1457"
            }
        }
    
    @staticmethod
    def get_themed_stylesheet(theme_name="Blue Ocean"):
        themes = ModernStyle.get_themes()
        theme = themes.get(theme_name, themes["Blue Ocean"])
        
        is_dark = theme_name == "Dark Mode"
        
        if is_dark:
            text_on_card = "#E1E1E1"
            text_on_bg = "#B0B0B0"
            border_color = "#404040"
            hover_bg = "#3A3A3A"
            groupbox_title_color = "#BB86FC"  # رنگ عنوان GroupBox در حالت تاریک
        else:
            text_on_card = theme['text_primary']
            text_on_bg = theme['text_secondary']
            border_color = "#e0e0e0"
            hover_bg = theme['bg_gradient_start']
            groupbox_title_color = theme['primary']
        
        return f"""
        QMainWindow {{
            background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                stop:0 {theme['bg_gradient_start']}, stop:1 {theme['bg_gradient_end']});
            font-family: 'Segoe UI', Arial, sans-serif;
        }}
        
        QWidget {{
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 9pt;
            color: {text_on_card};
        }}
        
        /* Group boxes */
        QGroupBox {{
            font-weight: bold;
            border: 2px solid {border_color};
            border-radius: 12px;
            margin-top: 20px;
            padding-top: 25px;
            padding-left: 10px;
            padding-right: 10px;
            padding-bottom: 15px;
            background: {theme['card_bg']};
            color: {text_on_card};
        }}
        
        QGroupBox::title {{
            subcontrol-origin: margin;
            subcontrol-position: top left;
            left: 15px;
            top: 8px;
            padding: 5px 10px;
            color: {groupbox_title_color};
            font-size: 11pt;
            font-weight: bold;
            background: {theme['card_bg']};
            border: none;
        }}
        
        /* Buttons */
        QPushButton {{
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 {theme['card_bg']},
                stop:1 {theme['bg_gradient_start']});
            border: 2px solid {theme['primary']};
            border-radius: 10px;
            color: {theme['primary']};
            font-weight: bold;
            padding: 12px 15px;
            text-align: left;
            font-size: 10pt;
        }}
        
        QPushButton:hover {{
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 {theme['secondary']},
                stop:1 {theme['primary']});
            border: 2px solid {theme['secondary']};
            color: white;
        }}
        
        QPushButton:pressed {{
            background: {theme['secondary']};
            border: 2px solid {theme['accent']};
            color: white;
        }}
        
        QPushButton:disabled {{
            background: #757575;
            color: #BDBDBD;
            border: 2px solid #616161;
        }}
        
        /* Danger buttons */
        QPushButton[danger="true"] {{
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #F44336, stop:1 #D32F2F);
            color: white;
            border: 2px solid #C62828;
        }}
        
        QPushButton[danger="true"]:hover {{
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #EF5350, stop:1 #F44336);
        }}
        
        /* Success buttons */
        QPushButton[success="true"] {{
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #4CAF50, stop:1 #388E3C);
            color: white;
            border: 2px solid #2E7D32;
        }}
        
        QPushButton[success="true"]:hover {{
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #66BB6A, stop:1 #4CAF50);
        }}
        
        /* Combo boxes */
        QComboBox {{
            border: 2px solid {border_color};
            border-radius: 8px;
            padding: 10px;
            background: {theme['card_bg']};
            min-width: 120px;
            color: {text_on_card};
            font-size: 10pt;
        }}
        
        QComboBox:focus {{
            border-color: {theme['primary']};
        }}
        
        QComboBox::drop-down {{
            border: none;
            width: 30px;
            subcontrol-origin: padding;
            subcontrol-position: top right;
        }}
        
        QComboBox::down-arrow {{
            image: none;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid {text_on_card};
            margin-right: 8px;
        }}
        
        QComboBox QAbstractItemView {{
            background: {theme['card_bg']};
            color: {text_on_card};
            selection-background-color: {theme['primary']};
            selection-color: white;
            border: 2px solid {border_color};
            padding: 5px;
        }}
        
        /* Lists */
        QListWidget {{
            border: 2px solid {border_color};
            border-radius: 8px;
            background: {theme['card_bg']};
            alternate-background-color: {hover_bg};
            outline: none;
            color: {text_on_card};
            padding: 5px;
        }}
        
        QListWidget::item {{
            padding: 10px;
            border-bottom: 1px solid {border_color};
            border-radius: 4px;
            margin: 2px;
            color: {text_on_card};
        }}
        
        QListWidget::item:selected {{
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 {theme['primary']}, stop:1 {theme['secondary']});
            color: white;
            border-radius: 6px;
        }}
        
        QListWidget::item:hover {{
            background: {hover_bg};
            border-radius: 6px;
        }}
        
        /* Toolbar */
        QToolBar {{
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 {theme['card_bg']}, stop:1 {theme['bg_gradient_start']});
            border: none;
            border-bottom: 2px solid {border_color};
            padding: 8px;
            spacing: 5px;
        }}
        
        QToolBar QToolButton {{
            background: transparent;
            border: none;
            border-radius: 8px;
            padding: 10px;
            margin: 2px;
            color: {text_on_card};
            font-size: 14pt;
        }}
        
        QToolBar QToolButton:hover {{
            background: {hover_bg};
            border: 1px solid {theme['primary']};
        }}
        
        QToolBar QToolButton:pressed {{
            background: {theme['primary']};
            color: white;
        }}
        
        /* Status bar */
        QStatusBar {{
            background: {theme['card_bg']};
            border-top: 2px solid {border_color};
            color: {text_on_card};
            padding: 5px;
        }}
        
        QStatusBar QLabel {{
            color: {text_on_card};
            font-weight: bold;
        }}
        
        /* Progress Bar */
        QProgressBar {{
            border: 2px solid {border_color};
            border-radius: 8px;
            text-align: center;
            background: {theme['bg_gradient_start']};
            color: {text_on_card};
            font-weight: bold;
            min-height: 20px;
        }}
        
        QProgressBar::chunk {{
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 {theme['primary']}, stop:1 {theme['secondary']});
            border-radius: 6px;
        }}
        
        /* Scrollbar */
        QScrollBar:vertical {{
            border: none;
            background: {theme['bg_gradient_start']};
            width: 14px;
            border-radius: 7px;
            margin: 0px;
        }}
        
        QScrollBar::handle:vertical {{
            background: {theme['secondary']};
            border-radius: 7px;
            min-height: 30px;
        }}
        
        QScrollBar::handle:vertical:hover {{
            background: {theme['primary']};
        }}
        
        QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
            height: 0px;
        }}
        
        QScrollBar:horizontal {{
            border: none;
            background: {theme['bg_gradient_start']};
            height: 14px;
            border-radius: 7px;
            margin: 0px;
        }}
        
        QScrollBar::handle:horizontal {{
            background: {theme['secondary']};
            border-radius: 7px;
            min-width: 30px;
        }}
        
        QScrollBar::handle:horizontal:hover {{
            background: {theme['primary']};
        }}
        
        /* Tabs */
        QTabWidget::pane {{
            border: 2px solid {border_color};
            border-radius: 8px;
            background: {theme['card_bg']};
            padding: 5px;
        }}
        
        QTabBar::tab {{
            background: {theme['bg_gradient_start']};
            border: 2px solid {border_color};
            padding: 12px 24px;
            margin-right: 4px;
            color: {text_on_card};
            font-weight: bold;
            font-size: 10pt;
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
        }}
        
        QTabBar::tab:selected {{
            background: {theme['card_bg']};
            border-bottom-color: {theme['card_bg']};
            color: {theme['primary']};
        }}
        
        QTabBar::tab:hover {{
            background: {hover_bg};
            color: {theme['primary']};
        }}
        
        /* Labels */
        QLabel {{
            color: {text_on_card};
            background: transparent;
        }}
        
        /* Line Edit */
        QLineEdit {{
            background: {theme['card_bg']};
            border: 2px solid {border_color};
            border-radius: 8px;
            padding: 10px;
            color: {text_on_card};
            font-size: 10pt;
            selection-background-color: {theme['primary']};
            selection-color: white;
        }}
        
        QLineEdit:focus {{
            border-color: {theme['primary']};
            border-width: 2px;
        }}
        
        QLineEdit:disabled {{
            background: {hover_bg};
            color: {text_on_bg};
        }}
        
        /* Frame */
        QFrame {{
            color: {text_on_card};
        }}
        
        /* Splitter */
        QSplitter::handle {{
            background: {border_color};
            width: 2px;
        }}
        
        QSplitter::handle:hover {{
            background: {theme['primary']};
        }}
        
       /* Menu Bar */
        QMenuBar {{
            background: {theme['card_bg']};
            color: {text_on_card};
            border-bottom: 2px solid {border_color};
            padding: 4px;
        }}
        
        QMenuBar::item {{
            background: transparent;
            padding: 8px 15px;
            color: {text_on_card};
            border-radius: 4px;
            margin: 2px;
        }}
        
        QMenuBar::item:selected {{
            background: {hover_bg};
            color: {theme['primary']};
        }}
        
        QMenuBar::item:pressed {{
            background: {theme['primary']};
            color: white;
        }}
        
        QMenu {{
            background: {theme['card_bg']};
            color: {text_on_card};
            border: 2px solid {border_color};
            border-radius: 8px;
            padding: 5px;
        }}
        
        QMenu::item {{
            padding: 8px 30px;
            color: {text_on_card};
            border-radius: 4px;
            margin: 2px;
        }}
        
        QMenu::item:selected {{
            background: {theme['primary']};
            color: white;
        }}
        
        QMenu::separator {{
            height: 1px;
            background: {border_color};
            margin: 5px 10px;
        }}
        /* Labels */
        QLabel {{
            color: {text_on_card};
            background: transparent;
        }}

        /* Header Labels - برای عناوین اصلی */
        QLabel[headerLabel="true"] {{
            color: {groupbox_title_color};
            background: transparent;
            font-weight: bold;
            padding: 5px;
        }}
        """

class AnimatedButton(QPushButton):
    """Button with animation"""
    
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

class FloatingClassPanel(QFrame):
    """Floating annotation editor panel - Modern Design"""
    
    class_selected = pyqtSignal(str)
    annotation_edited = pyqtSignal(str)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.Tool | Qt.WindowType.FramelessWindowHint)
        
        self.dragging = False
        self.offset = QPointF()
        self.current_theme = "Blue Ocean"
        
        self.class_buttons = {}
        self.current_selected = None
        self.edit_mode = False
        
        self.setup_ui()
        
    def setup_ui(self):
        self.setObjectName("mainFrame")
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(10)
        
        # Header
        header = QHBoxLayout()
        header.setSpacing(6)
        
        icon_label = QLabel("✏️")
        icon_label.setFont(QFont("Segoe UI Emoji", 12))
        header.addWidget(icon_label)
        
        self.title_label = QLabel("Classes")
        self.title_label.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        header.addWidget(self.title_label)
        
        header.addStretch()
        
        # Menu button
        menu_btn = QPushButton("⋮")
        menu_btn.setFixedSize(22, 22)
        menu_btn.setObjectName("menuButton")
        menu_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        menu_btn.clicked.connect(self.show_menu)
        header.addWidget(menu_btn)
        
        # Close button
        close_btn = QPushButton("✕")
        close_btn.setFixedSize(22, 22)
        close_btn.setObjectName("closeButton")
        close_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        close_btn.clicked.connect(self.hide)
        header.addWidget(close_btn)
        
        layout.addLayout(header)
        
        # Separator
        separator = QFrame()
        separator.setFrameShape(QFrame.Shape.HLine)
        separator.setFixedHeight(1)
        separator.setObjectName("separator")
        layout.addWidget(separator)
        
        # Input field (hidden by default for class selection mode)
        self.class_input = QLineEdit()
        self.class_input.setPlaceholderText("Enter class name...")
        self.class_input.setFixedHeight(38)
        self.class_input.returnPressed.connect(self.save_annotation)
        self.class_input.setVisible(False)  # ✅ پیش‌فرض مخفی
        layout.addWidget(self.class_input)
        
        # Save button (only for adding new classes in edit mode)
        self.save_btn = QPushButton("Save (Enter)")
        self.save_btn.setProperty("success", True)
        self.save_btn.setFixedHeight(35)
        self.save_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.save_btn.clicked.connect(self.save_annotation)
        self.save_btn.setVisible(False)  # ✅ پیش‌فرض مخفی
        layout.addWidget(self.save_btn)
        
        # Separator
        separator2 = QFrame()
        separator2.setFrameShape(QFrame.Shape.HLine)
        separator2.setFixedHeight(1)
        separator2.setObjectName("separator")
        layout.addWidget(separator2)
        
        # Classes list with scroll
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setFixedHeight(300)  # ✅ افزایش ارتفاع
        scroll_area.setStyleSheet("QScrollArea { border: none; background: transparent; }")
        
        scroll_widget = QWidget()
        scroll_widget.setStyleSheet("background: transparent;")
        self.class_buttons_layout = QVBoxLayout(scroll_widget)
        self.class_buttons_layout.setSpacing(5)
        self.class_buttons_layout.setContentsMargins(0, 0, 0, 0)
        
        scroll_area.setWidget(scroll_widget)
        layout.addWidget(scroll_area)
        
        self.setFixedSize(340, 420)
        self.apply_theme()
    def apply_theme(self):
        theme = ModernStyle.get_themes().get(self.current_theme, ModernStyle.get_themes()["Blue Ocean"])
        is_dark = self.current_theme == "Dark Mode"
        
        if is_dark:
            bg_color = "#2C2C2C"
            text_color = "#E1E1E1"
            input_bg = "#1E1E1E"
            border_color = "#414141"
        else:
            bg_color = "#FFFFFF"
            text_color = theme['text_primary']
            input_bg = "#FFFFFF"
            border_color = "#E0E0E0"
        
        self.setStyleSheet(f"""
            QFrame#mainFrame {{
                background-color: {bg_color};
                border: 2px solid {theme['primary']};
                border-radius: 12px;
            }}
            
            QLabel {{
                background: transparent;
                border: none;
                color: {text_color};
            }}
            
            QLineEdit {{
                background-color: {input_bg};
                border: 2px solid {border_color};
                border-radius: 6px;
                padding: 10px;
                color: {text_color};
                font-size: 10pt;
            }}
            
            QLineEdit:focus {{
                border: 2px solid {theme['primary']};
            }}
            
            QPushButton {{
                background-color: {input_bg};
                border: 2px solid {theme['primary']};
                border-radius: 6px;
                color: {theme['primary']};
                font-weight: bold;
                padding: 8px 14px;
                text-align: center;
                font-size: 9pt;
            }}
            
            QPushButton:hover {{
                background-color: {theme['primary']};
                color: white;
            }}
            
            QPushButton:pressed {{
                background-color: {theme['secondary']};
            }}
            
            QPushButton[danger="true"] {{
                border-color: #F44336;
                color: #F44336;
            }}
            
            QPushButton[danger="true"]:hover {{
                background-color: #F44336;
                color: white;
            }}
            
            QPushButton[success="true"] {{
                border-color: #4CAF50;
                color: #4CAF50;
            }}
            
            QPushButton[success="true"]:hover {{
                background-color: #4CAF50;
                color: white;
            }}
            
            QPushButton#menuButton, QPushButton#closeButton {{
                background-color: transparent;
                border: none;
                color: {text_color};
                font-size: 13pt;
                padding: 0px;
            }}
            
            QPushButton#menuButton:hover, QPushButton#closeButton:hover {{
                background-color: {theme['bg_gradient_start']};
                border-radius: 11px;
            }}
            
            QPushButton[classButton="true"] {{
                background-color: {input_bg};
                border: 1px solid {border_color};
                border-radius: 6px;
                color: {text_color};
                font-weight: normal;
                padding: 8px 10px;
                text-align: left;
                font-size: 9pt;
                min-height: 30px;
            }}
            
            QPushButton[classButton="true"]:hover {{
                background-color: {theme['bg_gradient_start']};
                border: 1px solid {theme['primary']};
            }}
            
            QPushButton[selected="true"] {{
                background-color: {theme['primary']};
                border: 1px solid {theme['secondary']};
                color: white !important;
            }}
            
            QScrollBar:vertical {{
                background-color: {bg_color};
                width: 6px;
                border-radius: 3px;
                margin: 0px;
            }}
            
            QScrollBar::handle:vertical {{
                background-color: {theme['primary']};
                border-radius: 3px;
                min-height: 20px;
            }}
            
            QScrollBar::handle:vertical:hover {{
                background-color: {theme['secondary']};
            }}
            
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
                height: 0px;
            }}
            
            QFrame#separator {{
                background-color: {border_color};
            }}
        """)
    
    def show_menu(self):
        menu = QMenu(self)
        
        toggle_mode = QAction("Switch to Classes Mode" if self.edit_mode else "Switch to Edit Mode", self)
        toggle_mode.triggered.connect(self.toggle_mode)
        menu.addAction(toggle_mode)
        
        menu.exec(QCursor.pos())
    
    def toggle_mode(self):
        self.edit_mode = not self.edit_mode
        
        if self.edit_mode:
            self.title_label.setText("Add New Class")
            self.class_input.setVisible(True)
            self.save_btn.setVisible(True)
            self.save_btn.setText("Add (Enter)")
        else:
            self.title_label.setText("Classes")
            self.class_input.setVisible(False)
            self.save_btn.setVisible(False)
            
    def set_annotation(self, class_name: str):
        self.class_input.setText(class_name)
        self.class_input.setFocus()
        self.class_input.selectAll()
        
    def save_annotation(self):
        new_class = self.class_input.text().strip()
        if new_class:
            self.annotation_edited.emit(new_class)
            self.class_input.clear()
            

    def update_classes(self, classes, current_class=None):
        colors = ['#FF6B9D', '#C44569', '#FFA502', '#F8B500', '#6C5CE7', '#00D2D3', 
                  '#4CAF50', '#FF5722', '#2196F3', '#E91E63']
        
        while self.class_buttons_layout.count():
            item = self.class_buttons_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        self.class_buttons.clear()
        
        for i, class_name in enumerate(classes):
            btn_container = QWidget()
            btn_container.setStyleSheet("background: transparent;")
            btn_layout = QHBoxLayout(btn_container)
            btn_layout.setContentsMargins(0, 0, 0, 0)
            btn_layout.setSpacing(6)
            
            num_label = QLabel(f"{i+1}")
            num_label.setFixedWidth(18)
            num_label.setStyleSheet(f"color: {colors[i % len(colors)]}; font-weight: bold; font-size: 9pt;")
            btn_layout.addWidget(num_label)
            
            btn = QPushButton(class_name)
            btn.setProperty("classButton", True)
            btn.setToolTip(f"Press {i+1} to select '{class_name}'")
            btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            btn.clicked.connect(lambda checked, cn=class_name: self.select_class(cn))
            
            if class_name == current_class:
                btn.setProperty("selected", True)
                self.current_selected = btn
            else:
                btn.setProperty("selected", False)
            
            btn.setStyle(btn.style())
            self.class_buttons[class_name] = btn
            btn_layout.addWidget(btn, 1)
            
            dot_label = QLabel("●")
            dot_label.setFixedWidth(12)
            dot_label.setStyleSheet(f"color: {colors[i % len(colors)]}; font-size: 10pt;")
            btn_layout.addWidget(dot_label)
            
            self.class_buttons_layout.addWidget(btn_container)
        
        self.class_buttons_layout.addStretch()
        
    def select_class(self, class_name):
        if self.edit_mode:
            self.class_input.setText(class_name)
        else:
            if self.current_selected:
                self.current_selected.setProperty("selected", False)
                self.current_selected.setStyle(self.current_selected.style())
            
            if class_name in self.class_buttons:
                self.current_selected = self.class_buttons[class_name]
                self.current_selected.setProperty("selected", True)
                self.current_selected.setStyle(self.current_selected.style())
            
            self.class_selected.emit(class_name)
    
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.dragging = True
            self.offset = event.position()
            self.setCursor(QCursor(Qt.CursorShape.ClosedHandCursor))
            
    def mouseMoveEvent(self, event):
        if self.dragging:
            new_pos = self.mapToParent(event.position().toPoint() - self.offset.toPoint())
            self.move(new_pos)
            
    def mouseReleaseEvent(self, event):
        self.dragging = False
        self.setCursor(QCursor(Qt.CursorShape.ArrowCursor))
class ImageCanvas(QGraphicsView):
    """Advanced canvas for displaying and editing images"""
    
    annotation_created = pyqtSignal(dict)
    annotation_selected = pyqtSignal(int)
    annotation_delete_requested = pyqtSignal(int) 
    
    def __init__(self, parent=None):
        super().__init__(parent)
        
        self.scene = QGraphicsScene()
        self.setScene(self.scene)
        
        # Settings
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.RubberBandDrag)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        
        # Variables
        self.image_item = None
        self.image_pixmap = None
        self.annotations = []
        self.current_annotation = None
        self.drawing = False
        self.start_point = None
        self.current_rect = None
        self.annotation_color = QColor("#FF5722")
        self.selected_color = QColor("#2196F3")
        self.current_drawing_color = QColor("#2196F3")
        self.resizing = False
        self.resize_handle = None  # 'tl', 'tr', 'bl', 'br', 'l', 'r', 't', 'b'
        self.resize_annotation_index = None
        self.setBackgroundBrush(QBrush(QColor("#FFFFFF")))
        
    def set_image(self, image_path: str):
        """Set new image"""
        try:
            pixmap = QPixmap(image_path)
            if pixmap.isNull():
                print(f"Cannot load image: {image_path}")
                return False
                
            self.scene.clear()
            self.image_pixmap = pixmap  # Store pixmap
            self.image_item = self.scene.addPixmap(pixmap)
            self.annotations.clear()
            
            # Set scene size
            self.scene.setSceneRect(QRectF(pixmap.rect()))
            self.fitInView(self.image_item, Qt.AspectRatioMode.KeepAspectRatio)
            
            return True
        except Exception as e:
            print(f"Error loading image: {e}")
            return False
                
    def add_annotation(self, x1: int, y1: int, x2: int, y2: int, 
                    class_name: str, color: QColor = None):
        """Add new annotation with resize handles"""
        if color is None:
            color = self.annotation_color
            
        rect = QRectF(x1, y1, x2 - x1, y2 - y1)
        
        # Create rectangle
        rect_item = self.scene.addRect(rect, QPen(color, 2), QBrush())
        rect_item.setFlag(QGraphicsRectItem.GraphicsItemFlag.ItemIsSelectable)
        
        # Add label
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
    def contextMenuEvent(self, event):
        """نمایش منوی راست‌کلیک"""
        scene_pos = self.mapToScene(event.pos())
        clicked_annotation = self.get_annotation_at_point(scene_pos)
        
        if clicked_annotation is None:
            return
        
        menu = QMenu(self)
        
        # گرفتن تم والد
        parent = self.parent()
        while parent and not hasattr(parent, 'current_theme'):
            parent = parent.parent()
        
        if parent and hasattr(parent, 'current_theme'):
            theme_name = parent.current_theme
            theme = ModernStyle.get_themes()[theme_name]
            is_dark = theme_name == "Dark Mode"
            
            if is_dark:
                bg_color = "#2C2C2C"
                text_color = "#E1E1E1"
            else:
                bg_color = "#FFFFFF"
                text_color = "#212121"
            
            menu.setStyleSheet(f"""
                QMenu {{
                    background: {bg_color};
                    color: {text_color};
                    border: 2px solid {theme['primary']};
                    border-radius: 8px;
                    padding: 5px;
                }}
                QMenu::item {{
                    padding: 8px 30px;
                    color: {text_color};
                    border-radius: 4px;
                    margin: 2px;
                }}
                QMenu::item:selected {{
                    background: {theme['primary']};
                    color: white;
                }}
            """)
        
        delete_action = QAction("🗑️ Delete Annotation", self)
        delete_action.triggered.connect(
            lambda: self.annotation_delete_requested.emit(clicked_annotation)  
        )
        menu.addAction(delete_action)
        
        menu.exec(event.globalPos())

    def delete_annotation_by_index(self, index: int):
        """حذف annotation با index"""
        if 0 <= index < len(self.annotations):
            self.annotation_selected.emit(-1000 - index)  # سیگنال ویژه برای حذف
    def get_resize_handle(self, point: QPointF, ann_index: int) -> Optional[str]:
        """تشخیص handle برای resize"""
        if ann_index < 0 or ann_index >= len(self.annotations):
            return None
        
        ann = self.annotations[ann_index]
        x1, y1, x2, y2 = ann['x1'], ann['y1'], ann['x2'], ann['y2']
        
        handle_size = 8
        
        # بررسی گوشه‌ها
        if abs(point.x() - x1) < handle_size and abs(point.y() - y1) < handle_size:
            return 'tl'  # top-left
        elif abs(point.x() - x2) < handle_size and abs(point.y() - y1) < handle_size:
            return 'tr'  # top-right
        elif abs(point.x() - x1) < handle_size and abs(point.y() - y2) < handle_size:
            return 'bl'  # bottom-left
        elif abs(point.x() - x2) < handle_size and abs(point.y() - y2) < handle_size:
            return 'br'  # bottom-right
        
        # بررسی لبه‌ها
        elif abs(point.x() - x1) < handle_size and y1 < point.y() < y2:
            return 'l'  # left
        elif abs(point.x() - x2) < handle_size and y1 < point.y() < y2:
            return 'r'  # right
        elif abs(point.y() - y1) < handle_size and x1 < point.x() < x2:
            return 't'  # top
        elif abs(point.y() - y2) < handle_size and x1 < point.x() < x2:
            return 'b'  # bottom
        
        return None

    def update_annotation_geometry(self, ann_index: int, x1: int, y1: int, x2: int, y2: int):
        """به‌روزرسانی هندسه annotation"""
        if 0 <= ann_index < len(self.annotations):
            ann = self.annotations[ann_index]
            
            # اطمینان از صحت مختصات
            x1, x2 = min(x1, x2), max(x1, x2)
            y1, y2 = min(y1, y2), max(y1, y2)
            
            # به‌روزرسانی مختصات
            ann['x1'], ann['y1'] = x1, y1
            ann['x2'], ann['y2'] = x2, y2
            
            # به‌روزرسانی rectangle
            rect = QRectF(x1, y1, x2 - x1, y2 - y1)
            ann['rect_item'].setRect(rect)
            
            # به‌روزرسانی label
            ann['label_item'].setPos(x1, y1 - 20)        
    def remove_annotation(self, index: int):
        """Remove annotation"""
        if 0 <= index < len(self.annotations):
            ann = self.annotations[index]
            self.scene.removeItem(ann['rect_item'])
            self.scene.removeItem(ann['label_item'])
            del self.annotations[index]
            
    def clear_all_annotations(self):
        """Clear all annotations from canvas"""
        # حذف همه annotations از scene
        for ann in self.annotations:
            try:
                # حذف مستطیل
                if 'rect_item' in ann and ann['rect_item'] is not None:
                    self.scene.removeItem(ann['rect_item'])
                
                # حذف label
                if 'label_item' in ann and ann['label_item'] is not None:
                    self.scene.removeItem(ann['label_item'])
                    
            except RuntimeError:
                # Item قبلاً حذف شده
                pass
            except Exception as e:
                print(f"❌ Error removing annotation item: {e}")
        
        # پاک کردن لیست
        self.annotations.clear()
        
        # بازیابی تصویر
        if self.image_pixmap and self.image_item is None:
            self.image_item = self.scene.addPixmap(self.image_pixmap)
            
    def redraw_all_annotations(self, annotations_list):
        """Redraw all annotations"""
        self.clear_all_annotations()
        
        for ann in annotations_list:
            self.add_annotation(
                ann['x1'], ann['y1'], ann['x2'], ann['y2'],
                ann['class'], ann['color']
            )
            
    def select_annotation(self, index: int):
        """Select annotation"""
        # Clear previous selection
        if self.current_annotation is not None and self.current_annotation < len(self.annotations):
            old_ann = self.annotations[self.current_annotation]
            if 'rect_item' in old_ann and old_ann['rect_item'] in self.scene.items():
                old_ann['rect_item'].setPen(QPen(old_ann['color'], 2))
            
        # New selection
        if 0 <= index < len(self.annotations):
            self.current_annotation = index
            ann = self.annotations[index]
            if 'rect_item' in ann and ann['rect_item'] in self.scene.items():
                ann['rect_item'].setPen(QPen(self.selected_color, 3))
            



    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.image_item:
            scene_pos = self.mapToScene(event.position().toPoint())
            
            # بررسی کلیک روی annotation موجود
            clicked_annotation = self.get_annotation_at_point(scene_pos)
            
            if clicked_annotation is not None:
                # بررسی resize handle
                resize_handle = self.get_resize_handle(scene_pos, clicked_annotation)
                
                if resize_handle:
                    # شروع resize
                    self.resizing = True
                    self.resize_handle = resize_handle
                    self.resize_annotation_index = clicked_annotation
                    self.start_point = scene_pos
                    return
                else:
                    # انتخاب annotation
                    self.select_annotation(clicked_annotation)
                    self.annotation_selected.emit(clicked_annotation)
                    return
            
            # شروع رسم annotation جدید
            if self.scene.sceneRect().contains(scene_pos):
                self.drawing = True
                self.start_point = scene_pos
                
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        """Handle mouse move with bounds checking"""
        scene_pos = self.mapToScene(event.position().toPoint())
        
        # حالت resize
        if self.resizing and self.resize_annotation_index is not None:
            if self.resize_annotation_index >= len(self.annotations):
                self.resizing = False
                self.resize_annotation_index = None  # ✅ اضافه شد
                self.resize_handle = None  # ✅ اضافه شد
                return
            
            ann = self.annotations[self.resize_annotation_index]
            x1, y1, x2, y2 = ann['x1'], ann['y1'], ann['x2'], ann['y2']
            
            dx = scene_pos.x() - self.start_point.x()
            dy = scene_pos.y() - self.start_point.y()
            
            # اعمال تغییرات بر اساس handle
            if self.resize_handle == 'tl':
                x1 += dx
                y1 += dy
            elif self.resize_handle == 'tr':
                x2 += dx
                y1 += dy
            elif self.resize_handle == 'bl':
                x1 += dx
                y2 += dy
            elif self.resize_handle == 'br':
                x2 += dx
                y2 += dy
            elif self.resize_handle == 'l':
                x1 += dx
            elif self.resize_handle == 'r':
                x2 += dx
            elif self.resize_handle == 't':
                y1 += dy
            elif self.resize_handle == 'b':
                y2 += dy
            
            # محدود کردن به bounds تصویر
            if self.image_pixmap:
                img_width = self.image_pixmap.width()
                img_height = self.image_pixmap.height()
                
                x1 = max(0, min(x1, img_width))
                y1 = max(0, min(y1, img_height))
                x2 = max(0, min(x2, img_width))
                y2 = max(0, min(y2, img_height))
            
            # اطمینان از حداقل اندازه (10 پیکسل)
            if abs(x2 - x1) < 10 or abs(y2 - y1) < 10:
                return
            
            # به‌روزرسانی
            self.update_annotation_geometry(
                self.resize_annotation_index,
                int(x1), int(y1), int(x2), int(y2)
            )
            self.start_point = scene_pos
            return
        
        # حالت drawing
        if self.drawing and self.start_point:
            # حذف مستطیل قبلی
            if self.current_rect:
                try:
                    self.scene.removeItem(self.current_rect)
                except RuntimeError:
                    # Item قبلاً حذف شده
                    pass
                self.current_rect = None
            
            # محدود کردن به bounds
            if self.image_pixmap:
                scene_pos_x = max(0, min(scene_pos.x(), self.image_pixmap.width()))
                scene_pos_y = max(0, min(scene_pos.y(), self.image_pixmap.height()))
                scene_pos = QPointF(scene_pos_x, scene_pos_y)
            
            # رسم مستطیل جدید
            rect = QRectF(self.start_point, scene_pos).normalized()
            
            pen_color = self.current_drawing_color
            fill_color = QColor(self.current_drawing_color)
            fill_color.setAlpha(40)
            
            self.current_rect = self.scene.addRect(
                rect,
                QPen(pen_color, 3, Qt.PenStyle.SolidLine),
                QBrush(fill_color)
            )
        
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        """Handle mouse release"""
        # پایان resize
        if self.resizing:
            saved_index = self.resize_annotation_index  # ✅ ذخیره قبل از reset
            
            self.resizing = False
            self.resize_handle = None
            self.start_point = None
            self.resize_annotation_index = None
            
            # ارسال سیگنال برای ذخیره
            if saved_index is not None and 0 <= saved_index < len(self.annotations):
                self.annotation_selected.emit(saved_index)
            
            return
        
        # پایان drawing
        if self.drawing and self.start_point:
            scene_pos = self.mapToScene(event.position().toPoint())
            
            if self.current_rect:
                try:
                    self.scene.removeItem(self.current_rect)
                except RuntimeError:
                    pass
                self.current_rect = None
                
            rect = QRectF(self.start_point, scene_pos).normalized()
            if rect.width() > 10 and rect.height() > 10:
                annotation_data = {
                    'x1': int(rect.x()),
                    'y1': int(rect.y()),
                    'x2': int(rect.x() + rect.width()),
                    'y2': int(rect.y() + rect.height()),
                    'class': 'object'
                }
                self.annotation_created.emit(annotation_data)
                
            self.drawing = False
            self.start_point = None
            
        super().mouseReleaseEvent(event)
    def get_annotation_at_point(self, point: QPointF) -> Optional[int]:
        """Find annotation at specified point"""
        for i, ann in enumerate(self.annotations):
            rect = QRectF(ann['x1'], ann['y1'], 
                         ann['x2'] - ann['x1'], ann['y2'] - ann['y1'])
            if rect.contains(point):
                return i
        return None
        
    def zoom_in(self):
        """Zoom in"""
        self.scale(1.25, 1.25)
        
    def zoom_out(self):
        """Zoom out"""
        self.scale(0.8, 0.8)
        
    def fit_to_window(self):
        """Fit to window"""
        if self.image_item:
            self.fitInView(self.image_item, Qt.AspectRatioMode.KeepAspectRatio)
    def wheelEvent(self, event):
        """Zoom with mouse wheel"""
        zoom_in_factor = 1.15
        zoom_out_factor = 1 / zoom_in_factor
        
        if event.angleDelta().y() > 0:
            zoom_factor = zoom_in_factor
        else:
            zoom_factor = zoom_out_factor
            
        self.scale(zoom_factor, zoom_factor)

    def set_theme(self, theme_name: str):
        """تنظیم تم canvas"""
        if theme_name == "Dark Mode":
            self.setBackgroundBrush(QBrush(QColor("#1E1E1E")))
            self.scene.setBackgroundBrush(QBrush(QColor("#1E1E1E")))
        else:
            self.setBackgroundBrush(QBrush(QColor("#FFFFFF")))
            self.scene.setBackgroundBrush(QBrush(QColor("#FFFFFF")))

class AnnotationListWidget(QListWidget):
    """Advanced annotation list"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAlternatingRowColors(True)
        
    def add_annotation_item(self, annotation: dict, index: int):
        """Add annotation item"""
        text = f"{annotation['class']}\n({annotation['x1']}, {annotation['y1']}) → ({annotation['x2']}, {annotation['y2']})"
        item = QListWidgetItem(text)
        item.setData(Qt.ItemDataRole.UserRole, index)
        
        # Set color icon
        pixmap = QPixmap(16, 16)
        pixmap.fill(annotation.get('color', QColor("#FF5722")))
        item.setIcon(QIcon(pixmap))
        
        self.addItem(item)


class ClassManagerDialog(QDialog):
    """Class management dialog"""
    
    def __init__(self, parent=None, classes=None):
        super().__init__(parent)
        self.classes = classes[:] if classes else []  # Copy list
        self.setup_ui()
        
    def setup_ui(self):
        self.setWindowTitle("Manage Classes")
        self.setModal(True)
        self.resize(500, 600)
        
        if hasattr(self.parent(), 'current_theme'):
            theme = self.parent().current_theme
        else:
            theme = "Blue Ocean"
        self.setStyleSheet(ModernStyle.get_themed_stylesheet(theme))     
        palette = self.palette()
        theme_colors = ModernStyle.get_themes()[theme]
        if theme == "Dark Mode":
            palette.setColor(QPalette.ColorRole.Window, QColor("#2C2C2C"))
        else:
            palette.setColor(QPalette.ColorRole.Window, QColor("#FFFFFF"))
        self.setPalette(palette) 
        layout = QVBoxLayout(self)
        
        # Title
        title = QLabel("Object Class Management")
        title.setFont(QFont("Arial", 16, QFont.Weight.Bold))
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setProperty("headerLabel", True)
        title.setStyleSheet("padding: 20px;")
        layout.addWidget(title)
        
        # Class list
        group = QGroupBox("Existing Classes")
        group_layout = QVBoxLayout(group)
        
        self.class_list = QListWidget()

        for cls in self.classes:
            self.class_list.addItem(cls)
        group_layout.addWidget(self.class_list)
        
        # Management buttons
        buttons_layout = QHBoxLayout()
        
        up_btn = QPushButton("↑ Up")
        up_btn.clicked.connect(self.move_up)
        buttons_layout.addWidget(up_btn)
        
        down_btn = QPushButton("↓ Down")
        down_btn.clicked.connect(self.move_down)
        buttons_layout.addWidget(down_btn)
        
        remove_btn = QPushButton("Delete")
        remove_btn.setProperty("danger", True)
        remove_btn.setStyle(remove_btn.style())
        remove_btn.clicked.connect(self.remove_class)
        buttons_layout.addWidget(remove_btn)
        
        group_layout.addLayout(buttons_layout)
        layout.addWidget(group)
        
        # Add new class
        add_group = QGroupBox("Add New Class")
        add_layout = QHBoxLayout(add_group)
        
        self.class_input = QLineEdit()
        self.class_input.setPlaceholderText("Enter class name...")
        self.class_input.returnPressed.connect(self.add_class)
        add_layout.addWidget(self.class_input)
        
        add_btn = QPushButton("Add")
        add_btn.setProperty("success", True)
        add_btn.clicked.connect(self.add_class)
        add_layout.addWidget(add_btn)
        
        layout.addWidget(add_group)
        
        # Preset classes
        preset_group = QGroupBox("Preset Classes")
        preset_layout = QGridLayout(preset_group)
        
        presets = [
            "person", "car", "truck", "bus", "motorcycle", "bicycle",
            "dog", "cat", "bird", "train", "boat", "airplane"
        ]
        
        for i, preset in enumerate(presets):
            btn = QPushButton(preset)
            btn.clicked.connect(lambda checked, p=preset: self.add_preset_class(p))
            btn.setProperty("presetButton", True)

            preset_layout.addWidget(btn, i // 3, i % 3)
            
        layout.addWidget(preset_group)
        
        # Dialog buttons
        dialog_buttons = QHBoxLayout()
        
        ok_btn = QPushButton("OK")
        ok_btn.setProperty("success", True)
        ok_btn.setStyle(ok_btn.style())  
        ok_btn.clicked.connect(self.accept)
        dialog_buttons.addWidget(ok_btn)
        
        cancel_btn = QPushButton("Cancel")
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
            
            # Change in list
            self.classes[current_row], self.classes[current_row - 1] = \
                self.classes[current_row - 1], self.classes[current_row]
                
    def move_down(self):
        current_row = self.class_list.currentRow()
        if current_row < self.class_list.count() - 1:
            item = self.class_list.takeItem(current_row)
            self.class_list.insertItem(current_row + 1, item)
            self.class_list.setCurrentRow(current_row + 1)
            
            # Change in list
            self.classes[current_row], self.classes[current_row + 1] = \
                self.classes[current_row + 1], self.classes[current_row]

class ExportWorker(QThread):
    """Worker thread for exporting annotations without freezing UI"""
    progress_updated = pyqtSignal(int, str)  # (index, filename)
    export_finished = pyqtSignal(int, int)   # (success_count, total_count)
    error_occurred = pyqtSignal(str)         # error message
    
    def __init__(self, parent, image_files, output_dir, annotation_format, classes):
        super().__init__()
        self.parent_window = parent
        self.image_files = image_files
        self.output_dir = output_dir
        self.annotation_format = annotation_format
        self.classes = classes
        self._is_cancelled = False
        
    def cancel(self):
        """Cancel export operation"""
        self._is_cancelled = True
        
    def run(self):
        """Main export process"""
        success_count = 0
        
        for i, image_path in enumerate(self.image_files):
            if self._is_cancelled:
                break
                
            try:
                # بارگذاری annotations از فایل
                annotations = self.load_annotations_for_image(str(image_path))
                
                if annotations:
                    self.save_annotations_for_image(str(image_path), annotations)
                    success_count += 1
                
                # ارسال پیشرفت
                self.progress_updated.emit(i + 1, image_path.name)
                
            except Exception as e:
                print(f"❌ Error exporting {image_path.name}: {e}")
                self.error_occurred.emit(f"Error: {image_path.name} - {str(e)}")
        
        # ارسال نتیجه نهایی
        self.export_finished.emit(success_count, len(self.image_files))
    
    def load_annotations_for_image(self, image_path: str) -> List[Dict]:
        """Load annotations from file"""
        annotations = []
        
        try:
            if self.annotation_format == "YOLO":
                annotations = self._load_yolo(image_path)
            elif self.annotation_format == "Pascal VOC":
                annotations = self._load_pascal_voc(image_path)
            elif self.annotation_format == "CSV":
                annotations = self._load_csv(image_path)
        except Exception as e:
            print(f"Error loading annotations: {e}")
            
        return annotations
    
    def _load_yolo(self, image_path: str) -> List[Dict]:
        """Load YOLO format"""
        annotations = []
        txt_path = Path(image_path).with_suffix('.txt')
        
        if not txt_path.exists():
            return annotations
            
        try:
            # دریافت اندازه تصویر
            pixmap = QPixmap(image_path)
            if pixmap.isNull():
                return annotations
                
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
                            
                            # محدود کردن به مرزهای تصویر
                            x1 = max(0, min(x1, img_width))
                            y1 = max(0, min(y1, img_height))
                            x2 = max(0, min(x2, img_width))
                            y2 = max(0, min(y2, img_height))
                            
                            class_name = self.classes[int(class_id)] if int(class_id) < len(self.classes) else "unknown"
                            
                            annotations.append({
                                'class': class_name,
                                'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2
                            })
                        except (ValueError, IndexError):
                            continue
                            
        except Exception as e:
            print(f"Error loading YOLO: {e}")
            
        return annotations
    
    def _load_pascal_voc(self, image_path: str) -> List[Dict]:
        """Load Pascal VOC format"""
        annotations = []
        xml_path = Path(image_path).with_suffix('.xml')
        
        if not xml_path.exists():
            return annotations
            
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
                    
                    annotations.append({
                        'class': class_name,
                        'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2
                    })
                except ValueError:
                    continue
                    
        except Exception as e:
            print(f"Error loading Pascal VOC: {e}")
            
        return annotations
    
    def _load_csv(self, image_path: str) -> List[Dict]:
        """Load CSV format"""
        annotations = []
        csv_path = Path(image_path).with_suffix('.csv')
        
        if not csv_path.exists():
            return annotations
            
        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if 'filename' in row and row['filename'] == Path(image_path).name:
                        try:
                            annotations.append({
                                'class': row.get('class', 'unknown'),
                                'x1': int(float(row['x1'])),
                                'y1': int(float(row['y1'])),
                                'x2': int(float(row['x2'])),
                                'y2': int(float(row['y2']))
                            })
                        except (ValueError, KeyError):
                            continue
                            
        except Exception as e:
            print(f"Error loading CSV: {e}")
            
        return annotations
    
    def save_annotations_for_image(self, image_path: str, annotations: List[Dict]):
        """Save annotations to file"""
        try:
            if self.annotation_format == "YOLO":
                self._save_yolo(image_path, annotations)
            elif self.annotation_format == "Pascal VOC":
                self._save_pascal_voc(image_path, annotations)
            elif self.annotation_format == "COCO":
                self._save_coco(image_path, annotations)
            elif self.annotation_format == "CSV":
                self._save_csv(image_path, annotations)
        except Exception as e:
            print(f"Error saving annotations: {e}")
            raise
    
    def _save_yolo(self, image_path: str, annotations: List[Dict]):
        """Save YOLO format"""
        output_path = Path(image_path).with_suffix('.txt')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        pixmap = QPixmap(image_path)
        if pixmap.isNull():
            return
            
        img_width, img_height = pixmap.width(), pixmap.height()
        
        with open(output_path, 'w', encoding='utf-8') as f:
            for ann in annotations:
                try:
                    class_id = self.classes.index(ann['class']) if ann['class'] in self.classes else 0
                    
                    center_x = ((ann['x1'] + ann['x2']) / 2) / img_width
                    center_y = ((ann['y1'] + ann['y2']) / 2) / img_height
                    width = (ann['x2'] - ann['x1']) / img_width
                    height = (ann['y2'] - ann['y1']) / img_height
                    
                    f.write(f"{class_id} {center_x:.6f} {center_y:.6f} {width:.6f} {height:.6f}\n")
                except Exception as e:
                    print(f"Error saving annotation: {e}")
                    continue
    
    def _save_pascal_voc(self, image_path: str, annotations: List[Dict]):
        """Save Pascal VOC format"""
        output_path = Path(image_path).with_suffix('.xml')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        pixmap = QPixmap(image_path)
        if pixmap.isNull():
            return
            
        img_width, img_height = pixmap.width(), pixmap.height()
        
        annotation = ET.Element('annotation')
        
        folder = ET.SubElement(annotation, 'folder')
        folder.text = str(Path(image_path).parent.name)
        
        filename = ET.SubElement(annotation, 'filename')
        filename.text = Path(image_path).name
        
        size = ET.SubElement(annotation, 'size')
        ET.SubElement(size, 'width').text = str(img_width)
        ET.SubElement(size, 'height').text = str(img_height)
        ET.SubElement(size, 'depth').text = '3'
        
        for ann in annotations:
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
        
        xml_str = minidom.parseString(ET.tostring(annotation)).toprettyxml(indent="  ")
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(xml_str)
    
    def _save_coco(self, image_path: str, annotations: List[Dict]):
        """Save COCO format"""
        output_path = Path(image_path).with_suffix('.json')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        pixmap = QPixmap(image_path)
        if pixmap.isNull():
            return
            
        img_width, img_height = pixmap.width(), pixmap.height()
        
        coco_data = {
            "images": [{
                "id": 1,
                "file_name": Path(image_path).name,
                "width": img_width,
                "height": img_height
            }],
            "annotations": [],
            "categories": [{"id": i+1, "name": name} for i, name in enumerate(self.classes)]
        }
        
        for i, ann in enumerate(annotations):
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
    
    def _save_csv(self, image_path: str, annotations: List[Dict]):
        """Save CSV format"""
        output_path = Path(image_path).with_suffix('.csv')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['filename', 'class', 'x1', 'y1', 'x2', 'y2'])
            
            for ann in annotations:
                writer.writerow([
                    Path(image_path).name, ann['class'],
                    ann['x1'], ann['y1'], ann['x2'], ann['y2']
                ])
class AdvancedImageLabeler(QMainWindow):
    """Main image labeling application"""
    
    def __init__(self):
        super().__init__()
        
        # Main variables
        self.image_files = []
        self.current_index = 0
        self.annotations = []
        self.current_class = "person"
        self.classes = ["person", "car", "bike", "truck", "bus"]
        self.annotation_format = "YOLO"
        self.output_dir = ""
        self.settings = QSettings("ImageLabeler", "Advanced")
        self.current_theme = "Blue Ocean"
        self.floating_panel = None
        self.export_worker = None
        
        # ✅ Cache با OrderedDict
        self.thumbnail_cache = OrderedDict()
        self.max_cache_size = 500
        
        # ✅ Class colors
        self.class_colors = {}
        self.color_palette = ['#FF6B9D', '#C44569', '#FFA502', '#F8B500', '#6C5CE7', 
                            '#00D2D3', '#4CAF50', '#FF5722', '#2196F3', '#E91E63']
        
        self.update_class_colors()
        self.load_settings()
        self.setup_ui()
        self.setup_connections()
        self.create_floating_panel()
    def update_class_colors(self):
        for i, class_name in enumerate(self.classes):
            if class_name not in self.class_colors:
                self.class_colors[class_name] = QColor(self.color_palette[i % len(self.color_palette)])        
    def setup_ui(self):
        """Setup user interface"""
        self.setWindowTitle("Advanced Image Labeling Tool")
        
        screen = QApplication.primaryScreen().geometry()
        self.setGeometry(screen)
        self.showMaximized()     
        # Apply style
        self.setStyleSheet(ModernStyle.get_themed_stylesheet(self.current_theme))
        
        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Main layout
        main_layout = QHBoxLayout(central_widget)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(10, 10, 10, 10)
        
        self.create_image_panel(main_layout)
        
        # Toolbar
        self.create_toolbar()
        
        # Status bar
        self.create_statusbar()
        
        # Menu
        self.create_menubar()
        
    def create_image_panel(self, parent_layout):
        """Create image panel with file list"""
        # **Splitter برای تقسیم فضا**
        main_splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # **=== پنل سمت چپ - لیست فایل‌ها ===**
        left_panel = QFrame()
        left_panel.setFrameStyle(QFrame.Shape.StyledPanel)
        left_panel.setMinimumWidth(250)
        left_panel.setMaximumWidth(400)
        
        left_layout = QVBoxLayout(left_panel)
        left_layout.setSpacing(10)
        left_layout.setContentsMargins(15, 15, 15, 15)
        
        # عنوان
        files_title = QLabel("📁 Images")
        files_title.setFont(QFont("Segoe UI", 12, QFont.Weight.Bold))
        files_title.setProperty("headerLabel", True)
        left_layout.addWidget(files_title)
        
        # جعبه جستجو
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("🔍 Search images...")
        self.search_box.textChanged.connect(self.filter_images)
        left_layout.addWidget(self.search_box)
        
        # لیست فایل‌ها
        self.files_list = QListWidget()
        self.files_list.setIconSize(QSizeF(64, 64).toSize())
        self.files_list.itemClicked.connect(self.on_file_selected)
        self.files_list.setSpacing(5)
        left_layout.addWidget(self.files_list)
        
        # اطلاعات
        self.files_info_label = QLabel("No images loaded")
        self.files_info_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.files_info_label.setStyleSheet("padding: 10px; font-size: 9pt;")
        left_layout.addWidget(self.files_info_label)
        
        main_splitter.addWidget(left_panel)
        left_panel.setVisible(False) 
        self.left_panel = left_panel
        image_frame = QFrame()
        image_frame.setFrameStyle(QFrame.Shape.StyledPanel)
        
        layout = QVBoxLayout(image_frame)
        layout.setSpacing(10)
        layout.setContentsMargins(15, 15, 15, 15)
        
        title = QLabel("🖼️ Image")
        title.setFont(QFont("Segoe UI", 12, QFont.Weight.Bold))
        title.setProperty("headerLabel", True)
        layout.addWidget(title)
        
        # Canvas
        self.canvas = ImageCanvas()
        self.canvas.set_theme(self.current_theme) 
        layout.addWidget(self.canvas)
        
        # Navigation and Zoom controls
        controls_layout = QHBoxLayout()
        
        self.prev_btn_bottom = QPushButton("⬅️ Previous")
        self.prev_btn_bottom.clicked.connect(self.previous_image)
        controls_layout.addWidget(self.prev_btn_bottom)
        
        self.next_btn_bottom = QPushButton("➡️ Next")
        self.next_btn_bottom.clicked.connect(self.next_image)
        controls_layout.addWidget(self.next_btn_bottom)
        
        controls_layout.addStretch()
        
        zoom_out_btn = QPushButton("🔍-")
        zoom_out_btn.clicked.connect(self.canvas.zoom_out)
        controls_layout.addWidget(zoom_out_btn)
        
        fit_btn = QPushButton("🔲 Fit")
        fit_btn.clicked.connect(self.canvas.fit_to_window)
        controls_layout.addWidget(fit_btn)
        
        zoom_in_btn = QPushButton("🔍+")
        zoom_in_btn.clicked.connect(self.canvas.zoom_in)
        controls_layout.addWidget(zoom_in_btn)
        
        layout.addLayout(controls_layout)
        
        main_splitter.addWidget(image_frame)
        
        main_splitter.setSizes([300, 1350])        
        parent_layout.addWidget(main_splitter)
    # def create_annotations_tab(self):
    #     """Create annotations tab"""
    #     widget = QWidget()
    #     layout = QVBoxLayout(widget)
    #     layout.setSpacing(15)
    #     layout.setContentsMargins(10, 10, 10, 10)
        
    #     # Class selection
    #     class_group = QGroupBox("🎯 Select Class")
    #     class_layout = QVBoxLayout(class_group)
    #     class_layout.setSpacing(8)
        
    #     self.class_combo = QComboBox()
    #     self.class_combo.addItems(self.classes)
    #     self.class_combo.currentTextChanged.connect(self.on_class_changed)
    #     class_layout.addWidget(self.class_combo)
        
    #     # Manage classes button
    #     manage_classes_btn = QPushButton("🔧 Manage Classes")
    #     manage_classes_btn.clicked.connect(self.manage_classes)
    #     class_layout.addWidget(manage_classes_btn)
        
    #     layout.addWidget(class_group)
        
    #     # Annotations list
    #     ann_group = QGroupBox("🏷️ Existing Labels")
    #     ann_layout = QVBoxLayout(ann_group)
    #     ann_layout.setSpacing(8)
        
    #     self.annotations_list = AnnotationListWidget()
    #     self.annotations_list.itemClicked.connect(self.on_annotation_selected)
    #     ann_layout.addWidget(self.annotations_list)
        
    #     # Management buttons
    #     ann_buttons = QHBoxLayout()
        
    #     delete_btn = QPushButton("🗑️ Delete")
    #     delete_btn.setProperty("danger", True)
    #     delete_btn.clicked.connect(self.delete_annotation)
    #     ann_buttons.addWidget(delete_btn)
        
    #     clear_btn = QPushButton("🧹 Clear All")
    #     clear_btn.setProperty("danger", True)
    #     clear_btn.clicked.connect(self.clear_annotations)
    #     ann_buttons.addWidget(clear_btn)
        
    #     ann_layout.addLayout(ann_buttons)
    #     layout.addWidget(ann_group)
        
    #     return widget
        

    def create_toolbar(self):
        """Create toolbar"""
        toolbar = QToolBar("Main Toolbar")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        
        # Main buttons
        open_action = QAction("📂", self)
        open_action.triggered.connect(self.open_folder)
        open_action.setToolTip("Open Folder")
        toolbar.addAction(open_action)
        
        toolbar.addSeparator()
        
        # Class selection
        class_label = QLabel("🎯 Class:")
        toolbar.addWidget(class_label)
        
        self.toolbar_class_combo = QComboBox()
        self.toolbar_class_combo.addItems(self.classes)
        self.toolbar_class_combo.setMinimumWidth(150)
        self.toolbar_class_combo.currentTextChanged.connect(self.on_class_changed)
        toolbar.addWidget(self.toolbar_class_combo)
        
        manage_action = QAction("🔧", self)
        manage_action.triggered.connect(self.manage_classes)
        manage_action.setToolTip("Manage Classes")
        toolbar.addAction(manage_action)
        
        toolbar.addSeparator()
        
        # Annotations list
        ann_label = QLabel("🏷️ Labels:")
        toolbar.addWidget(ann_label)
        
        self.toolbar_annotations_list = QComboBox()
        self.toolbar_annotations_list.setMinimumWidth(200)
        self.toolbar_annotations_list.currentIndexChanged.connect(self.on_toolbar_annotation_selected)
        toolbar.addWidget(self.toolbar_annotations_list)
        
        delete_action = QAction("🗑️", self)
        delete_action.triggered.connect(self.delete_annotation)
        delete_action.setToolTip("Delete Selected")
        toolbar.addAction(delete_action)
        
        clear_action = QAction("🧹", self)
        clear_action.triggered.connect(self.clear_annotations)
        clear_action.setToolTip("Clear All")
        toolbar.addAction(clear_action)
        
        toolbar.addSeparator()
        
        prev_action = QAction("⬅️", self)
        prev_action.triggered.connect(self.previous_image)
        prev_action.setToolTip("Previous Image")
        toolbar.addAction(prev_action)
        
        next_action = QAction("➡️", self)
        next_action.triggered.connect(self.next_image)
        next_action.setToolTip("Next Image")
        toolbar.addAction(next_action)
        
        toolbar.addSeparator()
        
        zoom_in_action = QAction("🔍+", self)
        zoom_in_action.triggered.connect(self.canvas.zoom_in)
        zoom_in_action.setToolTip("Zoom In")
        toolbar.addAction(zoom_in_action)
        
        zoom_out_action = QAction("🔍-", self)
        zoom_out_action.triggered.connect(self.canvas.zoom_out)
        zoom_out_action.setToolTip("Zoom Out")
        toolbar.addAction(zoom_out_action)
        
        fit_action = QAction("🔲", self)
        fit_action.triggered.connect(self.canvas.fit_to_window)
        fit_action.setToolTip("Fit to Window")
        toolbar.addAction(fit_action)
        
        toolbar.addSeparator()
        
        save_action = QAction("💾", self)
        save_action.triggered.connect(self.save_annotations)
        save_action.setToolTip("Save")
        toolbar.addAction(save_action)
    def create_statusbar(self):
        """Create status bar"""
        statusbar = QStatusBar()
        self.setStatusBar(statusbar)
        
        self.status_label = QLabel("Ready - Select a folder")
        statusbar.addWidget(self.status_label)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        statusbar.addPermanentWidget(self.progress_bar)
        
    def create_menubar(self):
        """Create menu bar"""
        menubar = self.menuBar()
        
        # File menu
        file_menu = menubar.addMenu("📁 File")
        
        open_action = QAction("Open Folder", self)
        open_action.setShortcut(QKeySequence.StandardKey.Open)
        open_action.triggered.connect(self.open_folder)
        file_menu.addAction(open_action)
        
        file_menu.addSeparator()
        
        save_action = QAction("Save", self)
        save_action.setShortcut(QKeySequence.StandardKey.Save)
        save_action.triggered.connect(self.save_annotations)
        file_menu.addAction(save_action)
        
        export_action = QAction("Export All", self)
        export_action.triggered.connect(self.export_all)
        file_menu.addAction(export_action)
        
        file_menu.addSeparator()
        
        quit_action = QAction("Exit", self)
        quit_action.setShortcut(QKeySequence.StandardKey.Quit)
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)
        
        # Edit menu
        # Edit menu
        edit_menu = menubar.addMenu("✏️ Edit")

        # حذف annotation انتخاب شده
        delete_ann_action = QAction("Delete Selected Annotation", self)
        delete_ann_action.setShortcut(QKeySequence.StandardKey.Delete)
        delete_ann_action.triggered.connect(self.delete_annotation)
        edit_menu.addAction(delete_ann_action)

        # حذف تصویر فعلی
        delete_image_action = QAction("🗑️ Delete Current Image File", self)
        delete_image_action.setShortcut(QKeySequence("Shift+Delete"))
        delete_image_action.triggered.connect(self.delete_image_file)
        edit_menu.addAction(delete_image_action)

        edit_menu.addSeparator()

        # پاک کردن همه annotations + حذف فایل
        clear_action = QAction("Clear All Annotations & Delete File", self)
        clear_action.setShortcut(QKeySequence("Ctrl+Shift+C"))
        clear_action.triggered.connect(self.clear_annotations)
        edit_menu.addAction(clear_action)
                
        # View menu
        view_menu = menubar.addMenu("👁️ View")
        toggle_panel_action = QAction("Toggle Floating Panel", self)
        toggle_panel_action.setShortcut(QKeySequence("F1"))
        toggle_panel_action.triggered.connect(self.toggle_floating_panel)
        view_menu.addAction(toggle_panel_action)

        view_menu.addSeparator()
        zoom_in_action = QAction("Zoom In", self)
        zoom_in_action.setShortcut(QKeySequence("Ctrl++"))
        zoom_in_action.triggered.connect(self.canvas.zoom_in)
        view_menu.addAction(zoom_in_action)
        
        zoom_out_action = QAction("Zoom Out", self)
        zoom_out_action.setShortcut(QKeySequence("Ctrl+-"))
        zoom_out_action.triggered.connect(self.canvas.zoom_out)
        view_menu.addAction(zoom_out_action)
        
        fit_action = QAction("Fit to Window", self)
        fit_action.setShortcut(QKeySequence("Ctrl+0"))
        fit_action.triggered.connect(self.canvas.fit_to_window)
        view_menu.addAction(fit_action)
        
        # Tools menu
        tools_menu = menubar.addMenu("🛠️ Tools")
        
        manage_action = QAction("Manage Classes", self)
        manage_action.triggered.connect(self.manage_classes)
        tools_menu.addAction(manage_action)
        # Settings menu
        settings_menu = menubar.addMenu("⚙️ Settings")

        # Output format submenu
        format_submenu = settings_menu.addMenu("📋 Output Format")
        format_group = QActionGroup(self)
        format_group.setExclusive(True)

        for fmt in ["YOLO", "Pascal VOC", "COCO", "CSV"]:
            format_action = QAction(fmt, self)
            format_action.setCheckable(True)
            if fmt == self.annotation_format:
                format_action.setChecked(True)
            format_action.triggered.connect(lambda checked, f=fmt: self.on_format_changed(f))
            format_group.addAction(format_action)
            format_submenu.addAction(format_action)

        settings_menu.addSeparator()

        # Output directory
        output_action = QAction("📂 Select Output Directory", self)
        output_action.triggered.connect(self.select_output_dir)
        settings_menu.addAction(output_action)

        settings_menu.addSeparator()

        # Theme submenu
        theme_submenu = settings_menu.addMenu("🎨 Theme")
        theme_group = QActionGroup(self)
        theme_group.setExclusive(True)

        for theme_name in ModernStyle.get_themes().keys():
            theme_action = QAction(theme_name, self)
            theme_action.setCheckable(True)
            if theme_name == self.current_theme:
                theme_action.setChecked(True)
            theme_action.triggered.connect(lambda checked, t=theme_name: self.change_theme(t))
            theme_group.addAction(theme_action)
            theme_submenu.addAction(theme_action)

        settings_menu.addSeparator()

        # Export all
        export_all_action = QAction("📤 Export All", self)
        export_all_action.triggered.connect(self.export_all)
        settings_menu.addAction(export_all_action)
        # Help menu
        help_menu = menubar.addMenu("❓ Help")
        
        about_action = QAction("About", self)
        about_action.triggered.connect(self.show_about)
        help_menu.addAction(about_action)
        
    def setup_connections(self):
        """Setup connections"""
        self.canvas.annotation_created.connect(self.on_annotation_created)
        self.canvas.annotation_selected.connect(self.on_annotation_selected_canvas)
        self.canvas.annotation_delete_requested.connect(self.on_annotation_delete_requested)

    def create_floating_panel(self):
        """Create floating panel"""
        self.floating_panel = FloatingClassPanel(self)
        self.floating_panel.current_theme = self.current_theme
        self.floating_panel.apply_theme()
        self.floating_panel.class_selected.connect(self.on_floating_class_selected)
        self.floating_panel.update_classes(self.classes, self.current_class)
        
        # Initial position (top right corner)
        self.floating_panel.move(20, 100)
        self.floating_panel.hide()
    def on_floating_class_selected(self, class_info):
        """Handle class selection from floating panel"""
        if class_info.startswith("ADD_NEW:"):
            # Add new class
            new_class = class_info.replace("ADD_NEW:", "")
            if new_class and new_class not in self.classes:
                self.classes.append(new_class)
                if hasattr(self, 'toolbar_class_combo'):
                    self.toolbar_class_combo.addItem(new_class)
                self.floating_panel.update_classes(self.classes, new_class)
                self.current_class = new_class
                if hasattr(self, 'toolbar_class_combo'):
                    self.toolbar_class_combo.setCurrentText(new_class)
                self.status_label.setText(f"✅ New class added: {new_class}")
        else:
            # Select existing class
            self.current_class = class_info
            if hasattr(self, 'toolbar_class_combo'):
                self.toolbar_class_combo.setCurrentText(class_info)
            self.floating_panel.update_classes(self.classes, class_info)
            
    def toggle_floating_panel(self):
        """Toggle floating panel visibility"""
        if self.floating_panel:
            if self.floating_panel.isVisible():
                self.floating_panel.hide()
            else:
                self.floating_panel.show()        
    def open_folder(self):
        """Open image folder"""
        folder = QFileDialog.getExistingDirectory(self, "Select Image Folder")
        if folder:
            self.load_images_from_folder(folder)
            
    def load_images_from_folder(self, folder_path: str):
        """Load images from folder"""
        extensions = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.gif')
        self.image_files = []
        
        folder = Path(folder_path)
        
        # Use set to prevent duplicates
        image_set = set()
        
        for ext in extensions:
            # Search lowercase
            image_set.update(folder.glob(f"*{ext}"))
            # Search uppercase
            image_set.update(folder.glob(f"*{ext.upper()}"))
        
        self.image_files = sorted(list(image_set))
        
        if self.image_files:
            self.current_index = 0
            self.thumbnail_cache.clear()  
            self.update_files_list()
            self.load_current_image()
            self.status_label.setText(f"{len(self.image_files)} images loaded")
        else:
            QMessageBox.warning(self, "Warning", "No images found in selected folder!")
        if hasattr(self, 'left_panel'):
            self.left_panel.setVisible(True)     
    def create_thumbnail(self, image_path: str, size: int = 64) -> QPixmap:
        """Create thumbnail from image - Optimized with LRU cache"""
        cache_key = str(image_path)
        
        # بررسی cache و به‌روزرسانی LRU
        if cache_key in self.thumbnail_cache:
            # انتقال به آخر (اخیراً استفاده شده)
            self.thumbnail_cache.move_to_end(cache_key)
            return self.thumbnail_cache[cache_key]
        
        # محدود کردن cache - حذف قدیمی‌ترین
        if len(self.thumbnail_cache) >= self.max_cache_size:
            # حذف اولین آیتم (قدیمی‌ترین)
            self.thumbnail_cache.popitem(last=False)
        
        try:
            img = Image.open(image_path)
            img.thumbnail((size, size), Image.Resampling.LANCZOS)
            
            img_rgb = img.convert('RGB')
            data = img_rgb.tobytes("raw", "RGB")
            qimage = QImage(data, img_rgb.width, img_rgb.height, QImage.Format.Format_RGB888)
            thumbnail = QPixmap.fromImage(qimage)
            
            # اضافه کردن به cache
            self.thumbnail_cache[cache_key] = thumbnail
            return thumbnail
            
        except Exception as e:
            print(f"❌ Error creating thumbnail for {image_path}: {e}")
            # ایجاد placeholder
            default_pixmap = QPixmap(size, size)
            default_pixmap.fill(QColor("#E0E0E0"))
            return default_pixmap
    def filter_images(self, text: str):
        """Filter images based on search text"""
        search_text = text.lower()
        
        for i in range(self.files_list.count()):
            item = self.files_list.item(i)
            if search_text in item.text().lower():
                item.setHidden(False)
            else:
                item.setHidden(True)

    def on_file_selected(self, item: QListWidgetItem):
        """Handle file selection from list"""
        index = item.data(Qt.ItemDataRole.UserRole)
        
        if index is None:
            return
        
        # اگر تصویر فعلی تغییر کرده
        if index != self.current_index:
            # ذخیره annotations تصویر فعلی
            try:
                if self.annotations:
                    self.save_annotations()
            except Exception as e:
                print(f"❌ Error saving annotations: {e}")
                QMessageBox.warning(
                    self, 
                    "Save Error", 
                    f"Could not save current annotations:\n{str(e)}"
                )
            
            # بارگذاری تصویر جدید
            self.current_index = index
            self.load_current_image()
            self.update_files_list()

    def update_files_list(self):
        """Update files list with thumbnails - Optimized"""
        self.files_list.clear()
        
        if not self.image_files:
            self.files_info_label.setText("No images loaded")
            return
        
        for i, image_path in enumerate(self.image_files):
            try:
                item = QListWidgetItem()
                item.setText(f"{i+1}. {image_path.name}")
                item.setData(Qt.ItemDataRole.UserRole, i)
                
                # هایلایت کردن تصویر فعلی
                if i == self.current_index:
                    font = item.font()
                    font.setBold(True)
                    item.setFont(font)
                    theme = ModernStyle.get_themes()[self.current_theme]
                    item.setBackground(QColor(theme['bg_gradient_start']))
                
                self.files_list.addItem(item)
                
            except Exception as e:
                print(f"❌ Error adding item {i}: {e}")
                continue
        
        # بارگذاری thumbnails به صورت async
        if self.image_files:
            QTimer.singleShot(50, self.load_thumbnails_async)
        
        # به‌روزرسانی اطلاعات
        self.files_info_label.setText(f"Total: {len(self.image_files)} images")
        
        # اسکرول به تصویر فعلی
        if 0 <= self.current_index < self.files_list.count():
            self.files_list.setCurrentRow(self.current_index)
            self.files_list.scrollToItem(
                self.files_list.item(self.current_index),
                QListWidget.ScrollHint.PositionAtCenter
            )
        
        # به‌روزرسانی statusbar
        if self.image_files:
            self.status_label.setText(
                f"Image {self.current_index + 1} / {len(self.image_files)} - {self.image_files[self.current_index].name}"
            )
    def load_thumbnails_async(self):
        """Load thumbnails asynchronously with proper cancellation"""
        max_items_per_batch = 15
        current_batch = 0
        
        # ذخیره snapshot از لیست فایل‌ها
        images_snapshot = self.image_files[:]
        total_images = len(images_snapshot)
        
        # شناسه منحصر به فرد برای این عملیات
        load_operation_id = f"{id(images_snapshot)}_{time.time()}" 
        
        # لغو عملیات قبلی
        if not hasattr(self, '_current_thumbnail_load_id'):
            self._current_thumbnail_load_id = None
        
        self._current_thumbnail_load_id = load_operation_id
        
        def load_batch():
            nonlocal current_batch
            
            try:
                # بررسی لغو شدن
                if self._current_thumbnail_load_id != load_operation_id:
                    return
                
                # بررسی تغییر لیست اصلی
                if len(self.image_files) != len(images_snapshot):
                    return
                
                start_idx = current_batch * max_items_per_batch
                end_idx = min(start_idx + max_items_per_batch, total_images)
                
                if start_idx >= total_images:
                    return
                
                for i in range(start_idx, end_idx):
                    try:
                        # بررسی دوباره لغو
                        if self._current_thumbnail_load_id != load_operation_id:
                            return
                        
                        # بررسی معتبر بودن index
                        if i >= len(images_snapshot) or i >= self.files_list.count():
                            break
                        
                        image_path = images_snapshot[i]
                        thumbnail = self.create_thumbnail(str(image_path))
                        
                        # بررسی item قبل از set icon
                        item = self.files_list.item(i)
                        if item and self._current_thumbnail_load_id == load_operation_id:
                            item.setIcon(QIcon(thumbnail))
                            
                    except Exception as e:
                        print(f"❌ Error loading thumbnail {i}: {e}")
                        continue
                
                current_batch += 1
                
                # ادامه batch بعدی
                if end_idx < total_images and self._current_thumbnail_load_id == load_operation_id:
                    QTimer.singleShot(30, load_batch)
                    
            except Exception as e:
                print(f"❌ Critical error in load_batch: {e}")
        
        # شروع بارگذاری
        QTimer.singleShot(10, load_batch)
    def load_current_image(self):
        """Load current image with proper error handling"""
        if not self.image_files:
            self.status_label.setText("No images loaded")
            return
        
        # بررسی معتبر بودن index
        if not (0 <= self.current_index < len(self.image_files)):
            self.current_index = 0
            if not self.image_files:
                return
        
        image_path = str(self.image_files[self.current_index])
        
        # بررسی وجود فایل
        if not Path(image_path).exists():
            QMessageBox.warning(
                self,
                "File Not Found",
                f"Image file not found:\n{image_path}\n\nRemoving from list..."
            )
            del self.image_files[self.current_index]
            if self.current_index >= len(self.image_files):
                self.current_index = max(0, len(self.image_files) - 1)
            if self.image_files:
                self.load_current_image()
            return
        
        try:
            # بارگذاری تصویر
            if not self.canvas.set_image(image_path):
                QMessageBox.critical(
                    self,
                    "Error",
                    f"Cannot load image:\n{Path(image_path).name}\n\nThe file may be corrupted or in an unsupported format."
                )
                return
            
            # بارگذاری annotations
            try:
                self.load_existing_annotations(image_path)
            except Exception as e:
                print(f"❌ Error loading annotations: {e}")
                QMessageBox.warning(
                    self,
                    "Annotation Load Error",
                    f"Could not load annotations for this image:\n{str(e)}\n\nStarting with empty annotations."
                )
                self.annotations.clear()
            
            # به‌روزرسانی UI
            self.update_canvas_annotations()
            self.update_annotations_list()
            
            # به‌روزرسانی status
            self.status_label.setText(
                f"✅ Loaded: {Path(image_path).name} ({self.current_index + 1}/{len(self.image_files)})"
            )
            
        except Exception as e:
            print(f"❌ Critical error loading image: {e}")
            QMessageBox.critical(
                self,
                "Critical Error",
                f"An unexpected error occurred:\n{str(e)}"
            )
    def load_existing_annotations(self, image_path: str):
        """Load existing annotations"""
        self.annotations.clear()
        
        # Based on selected format
        if self.annotation_format == "YOLO":
            self.load_yolo_annotations(image_path)
        elif self.annotation_format == "Pascal VOC":
            self.load_pascal_voc_annotations(image_path)
        elif self.annotation_format == "CSV":
            self.load_csv_annotations(image_path)
            
    def load_yolo_annotations(self, image_path: str):
        """Load YOLO annotations"""
        txt_path = Path(image_path).with_suffix('.txt')
        
        # If output path is set, read from there
        if self.output_dir:
            txt_path = Path(self.output_dir) / txt_path.name
        
        # Otherwise from image folder
        if not txt_path.exists():
            txt_path = Path(image_path).with_suffix('.txt')
            
        if txt_path.exists():
            # Get image size
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
                                
                                # Convert to absolute coordinates
                                x1 = int((center_x - width/2) * img_width)
                                y1 = int((center_y - height/2) * img_height)
                                x2 = int((center_x + width/2) * img_width)
                                y2 = int((center_y + height/2) * img_height)
                                
                                # Ensure coordinates are within image bounds
                                x1 = max(0, min(x1, img_width))
                                y1 = max(0, min(y1, img_height))
                                x2 = max(0, min(x2, img_width))
                                y2 = max(0, min(y2, img_height))
                                
                                # Get class name
                                class_name = self.classes[int(class_id)] if int(class_id) < len(self.classes) else "unknown"
                                
                                # استفاده از رنگ اختصاصی کلاس
                                color = self.class_colors.get(class_name, QColor("#FF5722"))

                                self.annotations.append({
                                    'class': class_name,
                                    'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                                    'color': color  # تغییر یافت
                                })
                            except (ValueError, IndexError) as e:
                                print(f"Error processing line: {line} - {e}")
                                continue
                                
            except Exception as e:
                print(f"Error loading annotations: {e}")
                
    def load_pascal_voc_annotations(self, image_path: str):
        """Load Pascal VOC annotations"""
        xml_path = Path(image_path).with_suffix('.xml')
        
        # If output path is set, read from there
        if self.output_dir:
            xml_path = Path(self.output_dir) / xml_path.name
            
        # Otherwise from image folder
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

                        color = self.class_colors.get(class_name, QColor("#FF5722"))

                        self.annotations.append({
                            'class': class_name,
                            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                            'color': color  
                        })
                    except ValueError as e:
                        print(f"Error processing bbox: {e}")
                        continue
                        
            except Exception as e:
                print(f"Error loading XML: {e}")
                
    def load_csv_annotations(self, image_path: str):
        """Load CSV annotations"""
        csv_path = Path(image_path).with_suffix('.csv')
        
        # If output path is set, read from there
        if self.output_dir:
            csv_path = Path(self.output_dir) / csv_path.name
            
        # Otherwise from image folder
        if not csv_path.exists():
            csv_path = Path(image_path).with_suffix('.csv')
            
        if csv_path.exists():
            try:
                with open(csv_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        if 'filename' in row and row['filename'] == Path(image_path).name:
                            try:
                                class_name = row.get('class', 'unknown')
                                color = self.class_colors.get(class_name, QColor("#FF5722"))
                                
                                self.annotations.append({
                                    'class': class_name,
                                    'x1': int(float(row['x1'])), 
                                    'y1': int(float(row['y1'])),
                                    'x2': int(float(row['x2'])), 
                                    'y2': int(float(row['y2'])),
                                    'color': color  
                                })
                            except (ValueError, KeyError) as e:
                                print(f"Error processing CSV row: {e}")
                                continue
                                
            except Exception as e:
                print(f"Error loading CSV: {e}")
                
    def update_canvas_annotations(self):
        """Update canvas annotations"""
        self.canvas.clear_all_annotations()
        for ann in self.annotations:
            self.canvas.add_annotation(
                ann['x1'], ann['y1'], ann['x2'], ann['y2'],
                ann['class'], ann.get('color', QColor("#FF5722"))
            ) 
                    
    def update_annotations_list(self):
        """Update annotations list"""
        if hasattr(self, 'toolbar_annotations_list'):
            self.update_toolbar_annotations()
    def update_toolbar_annotations(self):
        """Update toolbar annotations list"""
        self.toolbar_annotations_list.clear()
        for i, ann in enumerate(self.annotations):
            text = f"{i+1}. {ann['class']} ({ann['x1']},{ann['y1']})→({ann['x2']},{ann['y2']})"
            self.toolbar_annotations_list.addItem(text)    
    def on_toolbar_annotation_selected(self, index):
        """Handle annotation selection from toolbar"""
        if index >= 0 and index < len(self.annotations):
            self.canvas.select_annotation(index)
    def on_annotation_selected_canvas(self, index: int):
        """Handle annotation selection from canvas"""
        if 0 <= index < len(self.annotations):
            # انتخاب annotation
            if hasattr(self, 'toolbar_annotations_list'):
                self.toolbar_annotations_list.setCurrentIndex(index)
            
            # ذخیره بعد از resize
            if self.image_files:
                QTimer.singleShot(100, self.save_annotations)

    def on_annotation_created(self, annotation_data: dict):
        """Handle annotation creation"""
        annotation_data['class'] = self.current_class
        
        if self.current_class in self.class_colors:
            annotation_data['color'] = self.class_colors[self.current_class]
            self.canvas.current_drawing_color = self.class_colors[self.current_class]
        else:
            annotation_data['color'] = QColor("#FF5722")
            self.canvas.current_drawing_color = QColor("#FF5722")
        
        self.annotations.append(annotation_data)
        
        # Add to canvas
        self.canvas.add_annotation(
            annotation_data['x1'], annotation_data['y1'],
            annotation_data['x2'], annotation_data['y2'],
            annotation_data['class'], annotation_data['color']
        )
        
        self.update_annotations_list()
        
        # 🆕 ذخیره خودکار بعد از ایجاد annotation
        if self.image_files:
            self.save_annotations()
            self.status_label.setText(f"✅ Annotation added & saved")
        
    def on_annotation_selected(self, item: QListWidgetItem):
        """Handle annotation selection from list"""
        index = item.data(Qt.ItemDataRole.UserRole)
        if index is not None:
            self.canvas.select_annotation(index)
            if hasattr(self, 'toolbar_annotations_list'):
                self.toolbar_annotations_list.setCurrentIndex(index)
            

            
    def on_annotation_delete_requested(self, index: int):
        """Handle annotation deletion request from canvas context menu"""
        if 0 <= index < len(self.annotations):
            try:
                # حذف annotation
                del self.annotations[index]
                self.canvas.remove_annotation(index)
                self.update_canvas_annotations()
                self.update_annotations_list()
                
                # ذخیره فوری
                if self.image_files:
                    self.save_annotations()
                
                self.status_label.setText(f"✅ Annotation deleted")
                
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Error deleting annotation: {str(e)}")
            
    def on_class_changed(self, class_name: str):
        """Handle class change"""
        self.current_class = class_name
        
        if class_name in self.class_colors:
            self.canvas.current_drawing_color = self.class_colors[class_name]
        
        if self.floating_panel:
            self.floating_panel.update_classes(self.classes, class_name)
            
        # Update toolbar combo
        if hasattr(self, 'toolbar_class_combo'):
            self.toolbar_class_combo.setCurrentText(class_name)
            
    def on_format_changed(self, format_name: str):
        """Handle format change"""
        self.annotation_format = format_name
        if self.image_files:
            self.load_current_image()
    def change_theme(self, theme_name: str):
        """تغییر تم برنامه"""
        try:
            self.current_theme = theme_name
            
            # اعمال تم به main window
            self.setStyleSheet(ModernStyle.get_themed_stylesheet(theme_name))
            
            # اعمال تم به canvas
            self.canvas.set_theme(theme_name)
            
            # اعمال تم به floating panel بدون destroy
            if self.floating_panel:
                self.floating_panel.current_theme = theme_name
                self.floating_panel.apply_theme()
                self.floating_panel.update_classes(self.classes, self.current_class)
            
            # به‌روزرسانی theme preview اگر وجود دارد
            theme = ModernStyle.get_themes()[theme_name]
            if hasattr(self, 'theme_preview'):
                self.theme_preview.setStyleSheet(f"""
                    QFrame {{
                        background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                            stop:0 {theme['primary']},
                            stop:0.5 {theme['secondary']},
                            stop:1 {theme['accent']});
                        border-radius: 12px;
                        border: 2px solid #e0e0e0;
                    }}
                """)
            
            # Force update
            self.update()
            QApplication.processEvents()
            
            self.status_label.setText(f"✨ Theme changed to: {theme_name}")
            
        except Exception as e:
            print(f"❌ Error changing theme: {e}")
            QMessageBox.warning(self, "Error", f"Error changing theme: {str(e)}")
    def previous_image(self):
        """Load previous image"""
        if self.image_files and self.current_index > 0:
            self.save_annotations()
            self.current_index -= 1
            self.load_current_image()
            self.update_files_list()
            
    def next_image(self):
        """Load next image"""
        if self.image_files and self.current_index < len(self.image_files) - 1:
            self.save_annotations()
            self.current_index += 1
            self.load_current_image()
            self.update_files_list()
            
    def delete_annotation(self):
        """Delete selected annotation"""
        # دریافت index از toolbar
        if hasattr(self, 'toolbar_annotations_list'):
            current_index = self.toolbar_annotations_list.currentIndex()
        else:
            current_index = -1
        
        # بررسی معتبر بودن index
        if current_index < 0 or current_index >= len(self.annotations):
            # ایجاد دیالوگ warning با تم فعلی
            msg_box = QMessageBox(self)
            msg_box.setWindowTitle("Warning")
            msg_box.setText("Please select an annotation to delete!")
            msg_box.setIcon(QMessageBox.Icon.Warning)
            
            # اعمال تم
            theme = ModernStyle.get_themes()[self.current_theme]
            is_dark = self.current_theme == "Dark Mode"
            
            if is_dark:
                bg_color = "#2C2C2C"
                text_color = "#E1E1E1"
            else:
                bg_color = "#FFFFFF"
                text_color = "#212121"
            
            msg_box.setStyleSheet(f"""
                QMessageBox {{
                    background-color: {bg_color};
                    color: {text_color};
                }}
                QMessageBox QLabel {{
                    color: {text_color};
                    background: transparent;
                    font-size: 11pt;
                    padding: 10px;
                }}
                QPushButton {{
                    background: {theme['primary']};
                    color: white;
                    border: none;
                    border-radius: 8px;
                    padding: 10px 25px;
                    font-weight: bold;
                    font-size: 10pt;
                    min-width: 80px;
                }}
                QPushButton:hover {{
                    background: {theme['secondary']};
                }}
            """)
            
            msg_box.exec()
            return
        
        # ایجاد دیالوگ سفارشی با تم فعلی
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle("Confirm Delete")
        msg_box.setText(f"Delete annotation: {self.annotations[current_index]['class']}?")
        msg_box.setIcon(QMessageBox.Icon.Question)
        
        # دکمه‌های سفارشی
        yes_btn = msg_box.addButton("Yes", QMessageBox.ButtonRole.YesRole)
        no_btn = msg_box.addButton("No", QMessageBox.ButtonRole.NoRole)
        
        # اعمال تم
        theme = ModernStyle.get_themes()[self.current_theme]
        is_dark = self.current_theme == "Dark Mode"
        
        if is_dark:
            bg_color = "#2C2C2C"
            text_color = "#E1E1E1"
        else:
            bg_color = "#FFFFFF"
            text_color = "#212121"
        
        msg_box.setStyleSheet(f"""
            QMessageBox {{
                background-color: {bg_color};
                color: {text_color};
            }}
            QMessageBox QLabel {{
                color: {text_color};
                background: transparent;
                font-size: 11pt;
                padding: 10px;
            }}
            QPushButton {{
                background: {theme['primary']};
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px 25px;
                font-weight: bold;
                font-size: 10pt;
                min-width: 80px;
                margin: 5px;
            }}
            QPushButton:hover {{
                background: {theme['secondary']};
            }}
            QPushButton[text="No"] {{
                background: #757575;
            }}
            QPushButton[text="No"]:hover {{
                background: #616161;
            }}
        """)
        
        msg_box.exec()
        
        # بررسی پاسخ
        if msg_box.clickedButton() != yes_btn:
            return
        
        # حذف annotation
        try:
            del self.annotations[current_index]
            self.canvas.remove_annotation(current_index)
            self.update_canvas_annotations()
            self.update_annotations_list()
            
            # 🆕 ذخیره فوری فایل برای اعمال تغییرات
            if self.image_files:
                self.save_annotations()
            
            self.status_label.setText(f"✅ Annotation {current_index + 1} deleted & saved")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Error deleting annotation: {str(e)}")
    def delete_image_file(self):
        """Delete current image file from disk"""
        if not self.image_files or self.current_index < 0:
            QMessageBox.warning(self, "Warning", "No image selected!")
            return
        
        current_image = self.image_files[self.current_index]
        
        # دیالوگ تأیید سفارشی
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle("⚠️ Delete Image File")
        msg_box.setText(f"Are you sure you want to DELETE this image file?\n\n{current_image.name}\n\n⚠️ This action CANNOT be undone!")
        msg_box.setIcon(QMessageBox.Icon.Warning)
        
        # دکمه‌های سفارشی
        delete_btn = msg_box.addButton("Delete File", QMessageBox.ButtonRole.DestructiveRole)
        cancel_btn = msg_box.addButton("Cancel", QMessageBox.ButtonRole.RejectRole)
        
        # اعمال تم
        theme = ModernStyle.get_themes()[self.current_theme]
        is_dark = self.current_theme == "Dark Mode"
        
        if is_dark:
            bg_color = "#2C2C2C"
            text_color = "#E1E1E1"
        else:
            bg_color = "#FFFFFF"
            text_color = "#212121"
        
        msg_box.setStyleSheet(f"""
            QMessageBox {{
                background-color: {bg_color};
                color: {text_color};
            }}
            QMessageBox QLabel {{
                color: {text_color};
                background: transparent;
                font-size: 11pt;
                padding: 15px;
            }}
            QPushButton {{
                border: none;
                border-radius: 8px;
                padding: 12px 25px;
                font-weight: bold;
                font-size: 10pt;
                min-width: 100px;
                margin: 5px;
            }}
            QPushButton[text="Delete File"] {{
                background: #F44336;
                color: white;
            }}
            QPushButton[text="Delete File"]:hover {{
                background: #D32F2F;
            }}
            QPushButton[text="Cancel"] {{
                background: #757575;
                color: white;
            }}
            QPushButton[text="Cancel"]:hover {{
                background: #616161;
            }}
        """)
        
        msg_box.exec()
        
        # بررسی پاسخ
        if msg_box.clickedButton() != delete_btn:
            return
        
        try:
            # حذف فایل annotation (اگر وجود دارد)
            annotation_file = None
            if self.annotation_format == "YOLO":
                annotation_file = current_image.with_suffix('.txt')
            elif self.annotation_format == "Pascal VOC":
                annotation_file = current_image.with_suffix('.xml')
            elif self.annotation_format == "COCO":
                annotation_file = current_image.with_suffix('.json')
            elif self.annotation_format == "CSV":
                annotation_file = current_image.with_suffix('.csv')
            
            # حذف annotation file
            if annotation_file and annotation_file.exists():
                annotation_file.unlink()
            
            # حذف فایل تصویر
            current_image.unlink()
            
            # حذف از لیست
            del self.image_files[self.current_index]
            
            # بارگذاری تصویر بعدی
            if self.image_files:
                if self.current_index >= len(self.image_files):
                    self.current_index = len(self.image_files) - 1
                self.update_files_list()
                self.load_current_image()
                self.status_label.setText(f"✅ Image deleted: {current_image.name}")
            else:
                self.canvas.scene.clear()
                self.annotations.clear()
                self.update_annotations_list()
                self.status_label.setText("No images remaining")
                if hasattr(self, 'left_panel'):
                    self.left_panel.setVisible(False)
            
        except Exception as e:
            QMessageBox.critical(
                self, 
                "Error", 
                f"Could not delete image:\n{str(e)}"
            ) 
    def clear_annotations(self):
        """Clear all annotations and delete file"""
        if not self.annotations:
            # دیالوگ اطلاعات با تم صحیح
            msg_box = QMessageBox(self)
            msg_box.setWindowTitle("Info")
            msg_box.setText("No annotations to clear!")
            msg_box.setIcon(QMessageBox.Icon.Information)
            
            # اعمال تم
            theme = ModernStyle.get_themes()[self.current_theme]
            is_dark = self.current_theme == "Dark Mode"
            
            if is_dark:
                bg_color = "#2C2C2C"
                text_color = "#E1E1E1"
            else:
                bg_color = "#FFFFFF"
                text_color = "#212121"
            
            msg_box.setStyleSheet(f"""
                QMessageBox {{
                    background-color: {bg_color};
                    color: {text_color};
                }}
                QMessageBox QLabel {{
                    color: {text_color};
                    background: transparent;
                    font-size: 11pt;
                    padding: 15px;
                }}
                QPushButton {{
                    background: {theme['primary']};
                    color: white;
                    border: none;
                    border-radius: 8px;
                    padding: 10px 25px;
                    font-weight: bold;
                    font-size: 10pt;
                    min-width: 80px;
                }}
                QPushButton:hover {{
                    background: {theme['secondary']};
                }}
            """)
            
            msg_box.exec()
            return
        
        # دیالوگ تأیید ساده
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle("Confirm Clear")
        msg_box.setText(f"Clear all {len(self.annotations)} annotations and delete the file?")
        msg_box.setIcon(QMessageBox.Icon.Warning)
        
        # دکمه‌های سفارشی
        yes_btn = msg_box.addButton("Yes, Clear & Delete", QMessageBox.ButtonRole.YesRole)
        no_btn = msg_box.addButton("Cancel", QMessageBox.ButtonRole.NoRole)
        
        # اعمال تم
        theme = ModernStyle.get_themes()[self.current_theme]
        is_dark = self.current_theme == "Dark Mode"
        
        if is_dark:
            bg_color = "#2C2C2C"
            text_color = "#E1E1E1"
        else:
            bg_color = "#FFFFFF"
            text_color = "#212121"
        
        msg_box.setStyleSheet(f"""
            QMessageBox {{
                background-color: {bg_color};
                color: {text_color};
            }}
            QMessageBox QLabel {{
                color: {text_color};
                background: transparent;
                font-size: 11pt;
                padding: 15px;
            }}
            QPushButton {{
                border: none;
                border-radius: 8px;
                padding: 10px 20px;
                font-weight: bold;
                font-size: 10pt;
                min-width: 100px;
                margin: 5px;
            }}
            QPushButton[text="Yes, Clear & Delete"] {{
                background: #F44336;
                color: white;
            }}
            QPushButton[text="Yes, Clear & Delete"]:hover {{
                background: #D32F2F;
            }}
            QPushButton[text="Cancel"] {{
                background: #757575;
                color: white;
            }}
            QPushButton[text="Cancel"]:hover {{
                background: #616161;
            }}
        """)
        
        msg_box.exec()
        
        if msg_box.clickedButton() != yes_btn:
            return
        
        # پاک کردن از حافظه و canvas
        self.annotations.clear()
        self.canvas.clear_all_annotations()
        self.update_annotations_list()
        
        # حذف فایل annotation
        if self.image_files:
            try:
                current_image = self.image_files[self.current_index]
                
                # تشخیص فایل annotation بر اساس فرمت
                annotation_file = None
                if self.annotation_format == "YOLO":
                    annotation_file = current_image.with_suffix('.txt')
                elif self.annotation_format == "Pascal VOC":
                    annotation_file = current_image.with_suffix('.xml')
                elif self.annotation_format == "COCO":
                    annotation_file = current_image.with_suffix('.json')
                elif self.annotation_format == "CSV":
                    annotation_file = current_image.with_suffix('.csv')
                
                # اگر output_dir تنظیم شده، از آنجا حذف کن
                if self.output_dir and annotation_file:
                    annotation_file = Path(self.output_dir) / annotation_file.name
                
                # حذف فایل اگر وجود دارد
                if annotation_file and annotation_file.exists():
                    annotation_file.unlink()
                    self.status_label.setText(f"✅ All annotations cleared & file deleted")
                else:
                    self.status_label.setText(f"✅ All annotations cleared")
                    
            except Exception as e:
                QMessageBox.warning(
                    self, 
                    "Warning", 
                    f"Annotations cleared from memory, but could not delete file:\n{str(e)}"
                )
                self.status_label.setText("⚠️ Annotations cleared (file deletion failed)")
        else:
            self.status_label.setText("✅ All annotations cleared")
    def manage_classes(self):
        """Manage classes"""
        old_classes = self.classes[:]  # 🆕 نگه‌داری کلاس‌های قبلی
        
        dialog = ClassManagerDialog(self, self.classes)
        dialog.setStyleSheet(ModernStyle.get_themed_stylesheet(self.current_theme))

        if dialog.exec() == QDialog.DialogCode.Accepted:
            new_classes = dialog.classes[:]
            
            # 🆕 بررسی کلاس‌های حذف شده
            removed_classes = set(old_classes) - set(new_classes)
            
            if removed_classes and self.image_files:
                # شمارش annotations با کلاس‌های حذف شده در تصویر فعلی
                affected_count = sum(1 for ann in self.annotations if ann['class'] in removed_classes)
                
                if affected_count > 0:
                    msg_box = QMessageBox(self)
                    msg_box.setWindowTitle("⚠️ Warning")
                    msg_box.setText(
                        f"You removed {len(removed_classes)} class(es):\n{', '.join(removed_classes)}\n\n"
                        f"Current image has {affected_count} annotation(s) with removed classes.\n\n"
                        f"What do you want to do?"
                    )
                    msg_box.setIcon(QMessageBox.Icon.Warning)
                    
                    keep_btn = msg_box.addButton("Keep Annotations", QMessageBox.ButtonRole.YesRole)
                    delete_btn = msg_box.addButton("Delete Annotations", QMessageBox.ButtonRole.DestructiveRole)
                    cancel_btn = msg_box.addButton("Cancel Changes", QMessageBox.ButtonRole.RejectRole)
                    
                    # اعمال تم
                    theme = ModernStyle.get_themes()[self.current_theme]
                    is_dark = self.current_theme == "Dark Mode"
                    
                    if is_dark:
                        bg_color = "#2C2C2C"
                        text_color = "#E1E1E1"
                    else:
                        bg_color = "#FFFFFF"
                        text_color = "#212121"
                    
                    msg_box.setStyleSheet(f"""
                        QMessageBox {{
                            background-color: {bg_color};
                            color: {text_color};
                        }}
                        QMessageBox QLabel {{
                            color: {text_color};
                            background: transparent;
                            font-size: 10pt;
                            padding: 15px;
                        }}
                        QPushButton {{
                            border: none;
                            border-radius: 8px;
                            padding: 10px 20px;
                            font-weight: bold;
                            font-size: 10pt;
                            min-width: 120px;
                            margin: 5px;
                        }}
                        QPushButton[text="Keep Annotations"] {{
                            background: {theme['primary']};
                            color: white;
                        }}
                        QPushButton[text="Keep Annotations"]:hover {{
                            background: {theme['secondary']};
                        }}
                        QPushButton[text="Delete Annotations"] {{
                            background: #F44336;
                            color: white;
                        }}
                        QPushButton[text="Delete Annotations"]:hover {{
                            background: #D32F2F;
                        }}
                        QPushButton[text="Cancel Changes"] {{
                            background: #757575;
                            color: white;
                        }}
                        QPushButton[text="Cancel Changes"]:hover {{
                            background: #616161;
                        }}
                    """)
                    
                    msg_box.exec()
                    clicked = msg_box.clickedButton()
                    
                    if clicked == cancel_btn:
                        # بازگشت به کلاس‌های قبلی
                        return
                    elif clicked == delete_btn:
                        # حذف annotations با کلاس‌های حذف شده
                        self.annotations = [ann for ann in self.annotations if ann['class'] not in removed_classes]
                        self.update_canvas_annotations()
                        self.update_annotations_list()
                        self.save_annotations()
            
            # به‌روزرسانی کلاس‌ها
            self.classes = new_classes
            self.update_class_colors()
            
            if hasattr(self, 'toolbar_class_combo'):
                self.toolbar_class_combo.clear()
                self.toolbar_class_combo.addItems(self.classes)
            
            if self.classes:
                self.current_class = self.classes[0]
            
            if self.floating_panel:
                self.floating_panel.update_classes(self.classes, self.current_class)
                
    def select_output_dir(self):
        """Select output directory"""
        directory = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if directory:
            self.output_dir = directory
            # به‌روزرسانی status bar به جای output_label
            self.status_label.setText(f"📂 Output directory: {directory}")
            QMessageBox.information(
                self,
                "Output Directory Selected",
                f"Annotations will be saved to:\n{directory}"
            )
            
    def save_annotations(self):
        """Save annotations"""
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
                
            self.status_label.setText("Labels saved ✅")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Error saving: {str(e)}")
            
    def save_yolo_format(self, image_path: Path):
        """Save in YOLO format"""
        output_path = image_path.with_suffix('.txt')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        # Ensure path exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
            
        # Get image size
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
                    print(f"Error saving annotation: {e}")
                    continue
                
    def save_pascal_voc_format(self, image_path: Path):
        """Save in Pascal VOC format"""
        output_path = image_path.with_suffix('.xml')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        # Ensure path exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
            
        # Get image size
        pixmap = QPixmap(str(image_path))
        if pixmap.isNull():
            return
            
        img_width, img_height = pixmap.width(), pixmap.height()
        
        # Create XML
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
            
        # Write file
        xml_str = minidom.parseString(ET.tostring(annotation)).toprettyxml(indent="  ")
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(xml_str)
            
    def save_coco_format(self, image_path: Path):
        """Save in COCO format"""
        output_path = image_path.with_suffix('.json')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        # Ensure path exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
            
        # Get image size
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
        """Save in CSV format"""
        output_path = image_path.with_suffix('.csv')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        # Ensure path exists
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
        """Export all annotations using worker thread"""
        if not self.image_files:
            QMessageBox.warning(self, "Warning", "Please load images first!")
            return
            
        if not self.output_dir:
            self.select_output_dir()
            if not self.output_dir:
                return
        
        # تأیید از کاربر
        reply = QMessageBox.question(
            self, 
            "Export All", 
            f"Export {len(self.image_files)} images to:\n{self.output_dir}\n\nContinue?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        # نمایش progress bar
        self.progress_bar.setVisible(True)
        self.progress_bar.setMaximum(len(self.image_files))
        self.progress_bar.setValue(0)
        
        # غیرفعال کردن دکمه‌ها
        self.setEnabled(False)
        
        # ایجاد و شروع worker thread
        self.export_worker = ExportWorker(
            self,
            self.image_files,
            self.output_dir,
            self.annotation_format,
            self.classes
        )
        
        # اتصال سیگنال‌ها
        self.export_worker.progress_updated.connect(self.on_export_progress)
        self.export_worker.export_finished.connect(self.on_export_finished)
        self.export_worker.error_occurred.connect(self.on_export_error)
        
        # شروع export
        self.export_worker.start()
        self.status_label.setText("⏳ Exporting annotations...")

    def on_export_progress(self, index: int, filename: str):
        """Handle export progress update"""
        self.progress_bar.setValue(index)
        self.status_label.setText(f"⏳ Exporting: {filename} ({index}/{len(self.image_files)})")

    def on_export_finished(self, success_count: int, total_count: int):
        """Handle export completion"""
        self.setEnabled(True)
        self.progress_bar.setVisible(False)
        
        # بازگشت به تصویر فعلی
        self.load_current_image()
        
        self.status_label.setText(f"✅ Export completed: {success_count}/{total_count} files")
        
        QMessageBox.information(
            self, 
            "Export Complete",
            f"Export completed successfully!\n\n"
            f"Success: {success_count}/{total_count} files\n"
            f"Output: {self.output_dir}"
        )

    def on_export_error(self, error_message: str):
        """Handle export error"""
        print(f"❌ Export error: {error_message}")
    def show_about(self):
        """Show about dialog"""
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle("About")
        
        theme = ModernStyle.get_themes()[self.current_theme]
        is_dark = self.current_theme == "Dark Mode"
        
        if is_dark:
            bg_color = "#2C2C2C"
            text_color = "#E1E1E1"
            border_color = "#404040"
        else:
            bg_color = "#FFFFFF"
            text_color = "#212121"
            border_color = "#E0E0E0"
        
        msg_box.setStyleSheet(f"""
            QMessageBox {{
                background-color: {bg_color};
                color: {text_color};
            }}
            QMessageBox QLabel {{
                color: {text_color};
                background: transparent;
            }}
            QPushButton {{
                background: {theme['primary']};
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px 20px;
                font-weight: bold;
                min-width: 80px;
            }}
            QPushButton:hover {{
                background: {theme['secondary']};
            }}
        """)
        
        msg_box.setText(f"""
            <h2 style='color: {theme['primary']}'>Advanced Image Labeling Tool</h2>
            <p style='color: {text_color}'><b>Version:</b> 4.0.4</p>
            <p style='color: {text_color}'><b>Author:</b> Mahdi Mirzakhani</p>
            <p style='color: {text_color}'><b>Email:</b> mr79mahdi@gmail.com</p>

            <p style='color: {text_color}'><b>Description:</b> A powerful and beautiful tool for labeling objects in images</p>
            
            <h3 style='color: {theme['primary']}'>Features:</h3>
            <ul style='color: {text_color}'>
                <li>Modern and beautiful UI</li>
                <li>Support for YOLO, Pascal VOC, COCO, and CSV formats</li>
                <li>Advanced zoom and navigation controls</li>
                <li>Class management</li>
                <li>Auto-save</li>
                <li>Batch export</li>
            </ul>
            
            <p style='color: {text_color}'><i>Best wishes for success in your machine learning projects!</i></p>
        """)
        
        msg_box.setIcon(QMessageBox.Icon.Information)
        msg_box.exec()
        
    def load_settings(self):
        """Load settings"""
        try:
            self.classes = self.settings.value("classes", self.classes)
            self.annotation_format = self.settings.value("format", self.annotation_format)
            self.output_dir = self.settings.value("output_dir", self.output_dir)
            self.current_theme = self.settings.value("theme", "Blue Ocean")
            
            if hasattr(self, 'class_combo'):
                self.class_combo.clear()
                self.class_combo.addItems(self.classes)
            if hasattr(self, 'format_combo'):
                self.format_combo.setCurrentText(self.annotation_format)
            if hasattr(self, 'output_label') and self.output_dir:
                self.output_label.setText(f"📂 {self.output_dir}")
            if hasattr(self, 'theme_combo'):
                self.theme_combo.setCurrentText(self.current_theme)
                
        except Exception as e:
            print(f"Error loading settings: {e}")
            
    def save_settings(self):
        """Save settings"""
        try:
            self.settings.setValue("classes", self.classes)
            self.settings.setValue("format", self.annotation_format)
            self.settings.setValue("output_dir", self.output_dir)
            self.settings.setValue("theme", self.current_theme)
        except Exception as e:
            print(f"Error saving settings: {e}")
        
    def closeEvent(self, event):
        """Handle application close with proper cleanup"""
        try:
            # 1. لغو thumbnail loading
            if hasattr(self, '_current_thumbnail_load_id'):
                self._current_thumbnail_load_id = None
            
            # 2. بررسی export worker
            if hasattr(self, 'export_worker') and self.export_worker:
                if self.export_worker.isRunning():
                    reply = QMessageBox.question(
                        self,
                        "Export in Progress",
                        "Export is still running. Cancel and exit?",
                        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                        QMessageBox.StandardButton.No
                    )
                    
                    if reply == QMessageBox.StandardButton.No:
                        event.ignore()
                        return
                    
                    # لغو export
                    self.export_worker.cancel()
                    
                    # انتظار برای پایان - حداکثر 5 ثانیه
                    if not self.export_worker.wait(5000):
                        print("⚠️ Export worker did not finish, forcing termination")
                        self.export_worker.terminate()
                        self.export_worker.wait(1000)
            
            # 3. ذخیره annotations فعلی
            if self.annotations and self.image_files:
                try:
                    self.save_annotations()
                except Exception as e:
                    print(f"⚠️ Could not save annotations on exit: {e}")
                    reply = QMessageBox.question(
                        self,
                        "Unsaved Changes",
                        "Could not save current annotations. Exit anyway?",
                        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                        QMessageBox.StandardButton.No
                    )
                    if reply == QMessageBox.StandardButton.No:
                        event.ignore()
                        return
            
            # 4. ذخیره تنظیمات
            try:
                self.save_settings()
            except Exception as e:
                print(f"⚠️ Could not save settings: {e}")
            
            # 5. بستن floating panel
            if hasattr(self, 'floating_panel') and self.floating_panel:
                try:
                    self.floating_panel.hide()
                    self.floating_panel.deleteLater()
                    self.floating_panel = None
                except Exception as e:
                    print(f"⚠️ Could not close floating panel: {e}")
            
            # 6. پاکسازی cache
            try:
                if hasattr(self, 'thumbnail_cache'):
                    self.thumbnail_cache.clear()
            except Exception as e:
                print(f"⚠️ Could not clear cache: {e}")
            
            # 7. پاکسازی scene
            try:
                if hasattr(self, 'canvas') and hasattr(self.canvas, 'scene'):
                    self.canvas.scene.clear()
                    self.canvas.image_item = None
                    self.canvas.image_pixmap = None
            except Exception as e:
                print(f"⚠️ Could not clear scene: {e}")
            
            # 8. پاکسازی QApplication
            try:
                QApplication.processEvents()
            except:
                pass
            
            # پذیرش close event
            event.accept()
            
        except Exception as e:
            print(f"❌ Error during close: {e}")
            import traceback
            traceback.print_exc()
            # در صورت خطا، بدون پرسش close کن
            event.accept()
    def keyPressEvent(self, event):
        """Handle keyboard shortcuts"""
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
            elif Qt.Key.Key_1 <= event.key() <= Qt.Key.Key_9:  
                class_index = event.key() - Qt.Key.Key_1
                if class_index < len(self.classes):
                    self.current_class = self.classes[class_index]
                    if hasattr(self, 'toolbar_class_combo'):
                        self.toolbar_class_combo.setCurrentText(self.current_class)
                    if self.floating_panel:
                        self.floating_panel.update_classes(self.classes, self.current_class)
            else:
                super().keyPressEvent(event)
        except Exception as e:
            print(f"Error processing key: {e}")
            super().keyPressEvent(event)

def main():
    """Main function"""
    try:
        app = QApplication(sys.argv)
        
        # Set font
        font = QFont("Segoe UI", 9)
        app.setFont(font)
        
        # Set application name
        app.setApplicationName("Advanced Image Labeler")
        app.setApplicationVersion("3.0")
        app.setOrganizationName("AI Tools")
        
        # Create main window
        window = AdvancedImageLabeler()
        window.show()
        
        # Run application
        sys.exit(app.exec())
        
    except Exception as e:
        print(f"Critical error in application: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()