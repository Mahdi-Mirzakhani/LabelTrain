import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
import cv2
import numpy as np
from PIL import Image, ImageTk, ImageDraw
import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET
from xml.dom import minidom
import csv

class ImageLabeler:
    def __init__(self, root):
        self.root = root
        self.root.title("Advanced Image Labeling Tool")
        self.root.geometry("1400x900")
        self.root.configure(bg='#f0f0f0')
        
        # Initialize variables
        self.current_image = None
        self.original_image = None
        self.image_files = []
        self.current_index = 0
        self.annotations = []
        self.current_annotation = None
        self.drawing = False
        self.start_x = 0
        self.start_y = 0
        self.scale_factor = 1.0
        self.canvas_width = 800
        self.canvas_height = 600
        self.annotation_format = "YOLO"  # Default format
        self.class_names = ["person", "car", "bike", "truck", "bus"]  # Default classes
        self.current_class = "person"
        self.output_dir = ""
        
        self.setup_ui()
        self.load_settings()
        
    def setup_ui(self):
        # Create main frames
        self.create_menu()
        self.create_toolbar()
        self.create_main_layout()
        self.create_status_bar()
        
    def create_menu(self):
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)
        
        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="Open Folder", command=self.open_folder)
        file_menu.add_command(label="Save Annotations", command=self.save_annotations)
        file_menu.add_command(label="Export All", command=self.export_all_annotations)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.quit)
        
        # Edit menu
        edit_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Edit", menu=edit_menu)
        edit_menu.add_command(label="Clear All Annotations", command=self.clear_all_annotations)
        edit_menu.add_command(label="Delete Selected", command=self.delete_selected_annotation)
        
        # View menu
        view_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="View", menu=view_menu)
        view_menu.add_command(label="Zoom In", command=self.zoom_in)
        view_menu.add_command(label="Zoom Out", command=self.zoom_out)
        view_menu.add_command(label="Fit to Window", command=self.fit_to_window)
        
        # Settings menu
        settings_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Settings", menu=settings_menu)
        settings_menu.add_command(label="Manage Classes", command=self.manage_classes)
        settings_menu.add_command(label="Set Output Format", command=self.set_output_format)
        settings_menu.add_command(label="Set Output Directory", command=self.set_output_directory)
        
    def create_toolbar(self):
        toolbar = ttk.Frame(self.root, relief=tk.RAISED)
        toolbar.pack(side=tk.TOP, fill=tk.X, padx=5, pady=2)
        
        # Navigation buttons
        ttk.Button(toolbar, text="← Previous", command=self.previous_image).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="Next →", command=self.next_image).pack(side=tk.LEFT, padx=2)
        
        # Separator
        ttk.Separator(toolbar, orient='vertical').pack(side=tk.LEFT, fill=tk.Y, padx=10)
        
        # Class selection
        ttk.Label(toolbar, text="Class:").pack(side=tk.LEFT, padx=2)
        self.class_var = tk.StringVar(value=self.current_class)
        self.class_combo = ttk.Combobox(toolbar, textvariable=self.class_var, values=self.class_names, width=15)
        self.class_combo.pack(side=tk.LEFT, padx=2)
        self.class_combo.bind('<<ComboboxSelected>>', self.on_class_change)
        
        # Format selection
        ttk.Label(toolbar, text="Format:").pack(side=tk.LEFT, padx=(20, 2))
        self.format_var = tk.StringVar(value=self.annotation_format)
        format_combo = ttk.Combobox(toolbar, textvariable=self.format_var, 
                                   values=["YOLO", "Pascal VOC", "COCO", "CSV"], width=10)
        format_combo.pack(side=tk.LEFT, padx=2)
        format_combo.bind('<<ComboboxSelected>>', self.on_format_change)
        
        # Image counter
        self.image_counter_var = tk.StringVar(value="0 / 0")
        ttk.Label(toolbar, textvariable=self.image_counter_var).pack(side=tk.RIGHT, padx=10)
        
    def create_main_layout(self):
        # Main container
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Left panel - Image canvas
        left_frame = ttk.LabelFrame(main_frame, text="Image", padding=5)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
        
        # Canvas with scrollbars
        canvas_frame = ttk.Frame(left_frame)
        canvas_frame.pack(fill=tk.BOTH, expand=True)
        
        self.canvas = tk.Canvas(canvas_frame, bg='white', width=self.canvas_width, height=self.canvas_height)
        v_scrollbar = ttk.Scrollbar(canvas_frame, orient=tk.VERTICAL, command=self.canvas.yview)
        h_scrollbar = ttk.Scrollbar(canvas_frame, orient=tk.HORIZONTAL, command=self.canvas.xview)
        self.canvas.configure(yscrollcommand=v_scrollbar.set, xscrollcommand=h_scrollbar.set)
        
        v_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        h_scrollbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Bind canvas events
        self.canvas.bind("<Button-1>", self.on_canvas_click)
        self.canvas.bind("<B1-Motion>", self.on_canvas_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_canvas_release)
        self.canvas.bind("<Double-Button-1>", self.on_canvas_double_click)
        
        # Right panel - Controls and annotations
        right_frame = ttk.LabelFrame(main_frame, text="Controls", padding=5, width=300)
        right_frame.pack(side=tk.RIGHT, fill=tk.Y)
        right_frame.pack_propagate(False)
        
        # File list
        file_frame = ttk.LabelFrame(right_frame, text="Images", padding=5)
        file_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 5))
        
        # File listbox with scrollbar
        file_list_frame = ttk.Frame(file_frame)
        file_list_frame.pack(fill=tk.BOTH, expand=True)
        
        self.file_listbox = tk.Listbox(file_list_frame, height=8)
        file_scrollbar = ttk.Scrollbar(file_list_frame, orient=tk.VERTICAL, command=self.file_listbox.yview)
        self.file_listbox.configure(yscrollcommand=file_scrollbar.set)
        self.file_listbox.bind('<<ListboxSelect>>', self.on_file_select)
        
        file_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.file_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Annotations list
        ann_frame = ttk.LabelFrame(right_frame, text="Annotations", padding=5)
        ann_frame.pack(fill=tk.BOTH, expand=True)
        
        # Annotations listbox with scrollbar
        ann_list_frame = ttk.Frame(ann_frame)
        ann_list_frame.pack(fill=tk.BOTH, expand=True)
        
        self.ann_listbox = tk.Listbox(ann_list_frame, height=10)
        ann_scrollbar = ttk.Scrollbar(ann_list_frame, orient=tk.VERTICAL, command=self.ann_listbox.yview)
        self.ann_listbox.configure(yscrollcommand=ann_scrollbar.set)
        self.ann_listbox.bind('<<ListboxSelect>>', self.on_annotation_select)
        
        ann_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.ann_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Annotation buttons
        btn_frame = ttk.Frame(ann_frame)
        btn_frame.pack(fill=tk.X, pady=5)
        
        ttk.Button(btn_frame, text="Delete", command=self.delete_selected_annotation, width=10).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="Clear All", command=self.clear_all_annotations, width=10).pack(side=tk.LEFT, padx=2)
        
    def create_status_bar(self):
        self.status_var = tk.StringVar(value="Ready - Open a folder to start labeling")
        status_bar = ttk.Label(self.root, textvariable=self.status_var, relief=tk.SUNKEN)
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)
        
    def open_folder(self):
        folder_path = filedialog.askdirectory(title="Select Image Folder")
        if folder_path:
            self.load_images_from_folder(folder_path)
            
    def load_images_from_folder(self, folder_path):
        extensions = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.gif')
        self.image_files = []
        
        for ext in extensions:
            self.image_files.extend(Path(folder_path).glob(f"*{ext}"))
            self.image_files.extend(Path(folder_path).glob(f"*{ext.upper()}"))
            
        self.image_files = sorted(self.image_files)
        
        if self.image_files:
            self.current_index = 0
            self.update_file_list()
            self.load_current_image()
            self.status_var.set(f"Loaded {len(self.image_files)} images")
        else:
            messagebox.showwarning("No Images", "No supported image files found in the selected folder.")
            
    def update_file_list(self):
        self.file_listbox.delete(0, tk.END)
        for i, file_path in enumerate(self.image_files):
            self.file_listbox.insert(tk.END, file_path.name)
            if i == self.current_index:
                self.file_listbox.selection_set(i)
                
        self.image_counter_var.set(f"{self.current_index + 1} / {len(self.image_files)}")
        
    def load_current_image(self):
        if not self.image_files:
            return
            
        image_path = str(self.image_files[self.current_index])
        
        try:
            # Load image
            self.original_image = cv2.imread(image_path)
            self.original_image = cv2.cvtColor(self.original_image, cv2.COLOR_BGR2RGB)
            
            # Load existing annotations
            self.load_existing_annotations(image_path)
            
            # Display image
            self.display_image()
            self.update_annotation_list()
            
        except Exception as e:
            messagebox.showerror("Error", f"Could not load image: {str(e)}")
            
    def display_image(self):
        if self.original_image is None:
            return
            
        # Calculate scale to fit canvas
        img_height, img_width = self.original_image.shape[:2]
        scale_x = self.canvas_width / img_width
        scale_y = self.canvas_height / img_height
        self.scale_factor = min(scale_x, scale_y, 1.0)  # Don't scale up
        
        # Resize image
        new_width = int(img_width * self.scale_factor)
        new_height = int(img_height * self.scale_factor)
        
        resized_image = cv2.resize(self.original_image, (new_width, new_height))
        
        # Convert to PIL and then to Tkinter format
        pil_image = Image.fromarray(resized_image)
        
        # Draw annotations on image
        self.draw_annotations_on_image(pil_image)
        
        # Convert to PhotoImage
        self.current_image = ImageTk.PhotoImage(pil_image)
        
        # Display on canvas
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor=tk.NW, image=self.current_image)
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        
    def draw_annotations_on_image(self, pil_image):
        draw = ImageDraw.Draw(pil_image)
        
        for i, ann in enumerate(self.annotations):
            # Scale coordinates
            x1 = int(ann['x1'] * self.scale_factor)
            y1 = int(ann['y1'] * self.scale_factor)
            x2 = int(ann['x2'] * self.scale_factor)
            y2 = int(ann['y2'] * self.scale_factor)
            
            # Choose color
            color = 'red' if i == self.current_annotation else 'green'
            
            # Draw rectangle
            draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
            
            # Draw class label
            draw.text((x1, y1 - 15), ann['class'], fill=color)
            
    def on_canvas_click(self, event):
        if self.original_image is None:
            return
            
        self.drawing = True
        self.start_x = self.canvas.canvasx(event.x)
        self.start_y = self.canvas.canvasy(event.y)
        
    def on_canvas_drag(self, event):
        if not self.drawing:
            return
            
        # Clear previous temporary rectangle
        self.canvas.delete("temp_rect")
        
        # Draw temporary rectangle
        current_x = self.canvas.canvasx(event.x)
        current_y = self.canvas.canvasy(event.y)
        
        self.canvas.create_rectangle(
            self.start_x, self.start_y, current_x, current_y,
            outline='blue', tags="temp_rect", width=2
        )
        
    def on_canvas_release(self, event):
        if not self.drawing:
            return
            
        self.drawing = False
        
        # Get final coordinates
        end_x = self.canvas.canvasx(event.x)
        end_y = self.canvas.canvasy(event.y)
        
        # Convert back to original image coordinates
        x1 = int(min(self.start_x, end_x) / self.scale_factor)
        y1 = int(min(self.start_y, end_y) / self.scale_factor)
        x2 = int(max(self.start_x, end_x) / self.scale_factor)
        y2 = int(max(self.start_y, end_y) / self.scale_factor)
        
        # Check if rectangle is large enough
        if abs(x2 - x1) > 10 and abs(y2 - y1) > 10:
            # Add annotation
            annotation = {
                'class': self.class_var.get(),
                'x1': x1,
                'y1': y1,
                'x2': x2,
                'y2': y2
            }
            
            self.annotations.append(annotation)
            self.update_annotation_list()
            self.display_image()
            
        # Clear temporary rectangle
        self.canvas.delete("temp_rect")
        
    def on_canvas_double_click(self, event):
        # Select annotation at click position
        click_x = int(self.canvas.canvasx(event.x) / self.scale_factor)
        click_y = int(self.canvas.canvasy(event.y) / self.scale_factor)
        
        for i, ann in enumerate(self.annotations):
            if ann['x1'] <= click_x <= ann['x2'] and ann['y1'] <= click_y <= ann['y2']:
                self.current_annotation = i
                self.ann_listbox.selection_clear(0, tk.END)
                self.ann_listbox.selection_set(i)
                self.display_image()
                break
                
    def update_annotation_list(self):
        self.ann_listbox.delete(0, tk.END)
        for i, ann in enumerate(self.annotations):
            self.ann_listbox.insert(tk.END, f"{ann['class']} ({ann['x1']}, {ann['y1']}, {ann['x2']}, {ann['y2']})")
            
    def on_annotation_select(self, event):
        selection = self.ann_listbox.curselection()
        if selection:
            self.current_annotation = selection[0]
            self.display_image()
            
    def on_file_select(self, event):
        selection = self.file_listbox.curselection()
        if selection:
            self.current_index = selection[0]
            self.load_current_image()
            self.update_file_list()
            
    def on_class_change(self, event):
        self.current_class = self.class_var.get()
        
    def on_format_change(self, event):
        self.annotation_format = self.format_var.get()
        
    def previous_image(self):
        if self.image_files and self.current_index > 0:
            self.save_annotations()  # Auto-save current annotations
            self.current_index -= 1
            self.load_current_image()
            self.update_file_list()
            
    def next_image(self):
        if self.image_files and self.current_index < len(self.image_files) - 1:
            self.save_annotations()  # Auto-save current annotations
            self.current_index += 1
            self.load_current_image()
            self.update_file_list()
            
    def delete_selected_annotation(self):
        selection = self.ann_listbox.curselection()
        if selection:
            index = selection[0]
            del self.annotations[index]
            self.current_annotation = None
            self.update_annotation_list()
            self.display_image()
            
    def clear_all_annotations(self):
        if messagebox.askyesno("Clear All", "Are you sure you want to clear all annotations?"):
            self.annotations.clear()
            self.current_annotation = None
            self.update_annotation_list()
            self.display_image()
            
    def manage_classes(self):
        dialog = ClassManagerDialog(self.root, self.class_names)
        if dialog.result:
            self.class_names = dialog.result
            self.class_combo['values'] = self.class_names
            if self.current_class not in self.class_names:
                self.current_class = self.class_names[0] if self.class_names else "object"
                self.class_var.set(self.current_class)
                
    def set_output_format(self):
        formats = ["YOLO", "Pascal VOC", "COCO", "CSV"]
        choice = simpledialog.askstring("Output Format", f"Choose format: {', '.join(formats)}")
        if choice and choice in formats:
            self.annotation_format = choice
            self.format_var.set(choice)
            
    def set_output_directory(self):
        directory = filedialog.askdirectory(title="Select Output Directory")
        if directory:
            self.output_dir = directory
            self.status_var.set(f"Output directory set to: {directory}")
            
    def zoom_in(self):
        self.scale_factor = min(self.scale_factor * 1.2, 5.0)
        self.display_image()
        
    def zoom_out(self):
        self.scale_factor = max(self.scale_factor / 1.2, 0.1)
        self.display_image()
        
    def fit_to_window(self):
        self.display_image()
        
    def save_annotations(self):
        if not self.image_files or not self.annotations:
            return
            
        image_path = self.image_files[self.current_index]
        
        if self.annotation_format == "YOLO":
            self.save_yolo_format(image_path)
        elif self.annotation_format == "Pascal VOC":
            self.save_pascal_voc_format(image_path)
        elif self.annotation_format == "COCO":
            self.save_coco_format(image_path)
        elif self.annotation_format == "CSV":
            self.save_csv_format(image_path)
            
    def save_yolo_format(self, image_path):
        output_path = image_path.with_suffix('.txt')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        img_height, img_width = self.original_image.shape[:2]
        
        with open(output_path, 'w') as f:
            for ann in self.annotations:
                # Convert to YOLO format
                class_id = self.class_names.index(ann['class']) if ann['class'] in self.class_names else 0
                
                center_x = ((ann['x1'] + ann['x2']) / 2) / img_width
                center_y = ((ann['y1'] + ann['y2']) / 2) / img_height
                width = (ann['x2'] - ann['x1']) / img_width
                height = (ann['y2'] - ann['y1']) / img_height
                
                f.write(f"{class_id} {center_x:.6f} {center_y:.6f} {width:.6f} {height:.6f}\n")
                
    def save_pascal_voc_format(self, image_path):
        output_path = image_path.with_suffix('.xml')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        img_height, img_width, img_depth = self.original_image.shape
        
        # Create XML structure
        annotation = ET.Element('annotation')
        
        folder = ET.SubElement(annotation, 'folder')
        folder.text = str(image_path.parent.name)
        
        filename = ET.SubElement(annotation, 'filename')
        filename.text = image_path.name
        
        size = ET.SubElement(annotation, 'size')
        ET.SubElement(size, 'width').text = str(img_width)
        ET.SubElement(size, 'height').text = str(img_height)
        ET.SubElement(size, 'depth').text = str(img_depth)
        
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
            
        # Write XML file
        xml_str = minidom.parseString(ET.tostring(annotation)).toprettyxml(indent="  ")
        with open(output_path, 'w') as f:
            f.write(xml_str)
            
    def save_coco_format(self, image_path):
        # This is a simplified COCO format save for individual images
        output_path = image_path.with_suffix('.json')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        img_height, img_width = self.original_image.shape[:2]
        
        coco_data = {
            "images": [{
                "id": 1,
                "file_name": image_path.name,
                "width": img_width,
                "height": img_height
            }],
            "annotations": [],
            "categories": [{"id": i+1, "name": name} for i, name in enumerate(self.class_names)]
        }
        
        for i, ann in enumerate(self.annotations):
            class_id = self.class_names.index(ann['class']) + 1 if ann['class'] in self.class_names else 1
            
            coco_ann = {
                "id": i + 1,
                "image_id": 1,
                "category_id": class_id,
                "bbox": [ann['x1'], ann['y1'], ann['x2'] - ann['x1'], ann['y2'] - ann['y1']],
                "area": (ann['x2'] - ann['x1']) * (ann['y2'] - ann['y1']),
                "iscrowd": 0
            }
            coco_data["annotations"].append(coco_ann)
            
        with open(output_path, 'w') as f:
            json.dump(coco_data, f, indent=2)
            
    def save_csv_format(self, image_path):
        output_path = image_path.with_suffix('.csv')
        if self.output_dir:
            output_path = Path(self.output_dir) / output_path.name
            
        with open(output_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['filename', 'class', 'x1', 'y1', 'x2', 'y2'])
            
            for ann in self.annotations:
                writer.writerow([
                    image_path.name,
                    ann['class'],
                    ann['x1'],
                    ann['y1'],
                    ann['x2'],
                    ann['y2']
                ])
                
    def load_existing_annotations(self, image_path):
        self.annotations.clear()
        image_path = Path(image_path)
        
        # Try to load based on current format
        if self.annotation_format == "YOLO":
            self.load_yolo_annotations(image_path)
        elif self.annotation_format == "Pascal VOC":
            self.load_pascal_voc_annotations(image_path)
        elif self.annotation_format == "CSV":
            self.load_csv_annotations(image_path)
            
    def load_yolo_annotations(self, image_path):
        txt_path = image_path.with_suffix('.txt')
        if self.output_dir:
            txt_path = Path(self.output_dir) / txt_path.name
            
        if txt_path.exists():
            img_height, img_width = self.original_image.shape[:2]
                        
            with open(txt_path, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) == 5:
                        class_id, center_x, center_y, width, height = map(float, parts)

                        x1 = int((center_x - width/2) * img_width)
                        y1 = int((center_y - height/2) * img_height)
                        x2 = int((center_x + width/2) * img_width)
                        y2 = int((center_y + height/2) * img_height)

                        class_name = self.class_names[int(class_id)] if int(class_id) < len(self.class_names) else "unknown"

                        self.annotations.append({
                            'class': class_name,
                            'x1': x1,
                            'y1': y1,
                            'x2': x2,
                            'y2': y2
                        })

                            
    def load_csv_annotations(self, image_path):
        csv_path = image_path.with_suffix('.csv')
        if self.output_dir:
            csv_path = Path(self.output_dir) / csv_path.name
            
        if csv_path.exists():
            try:
                with open(csv_path, 'r') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        if row['filename'] == image_path.name:
                            self.annotations.append({
                                'class': row['class'],
                                'x1': int(row['x1']),
                                'y1': int(row['y1']),
                                'x2': int(row['x2']),
                                'y2': int(row['y2'])
                            })
            except (KeyError, ValueError):
                pass
                
    def export_all_annotations(self):
        if not self.image_files:
            messagebox.showwarning("No Images", "Please load images first.")
            return
            
        if not self.output_dir:
            self.set_output_directory()
            if not self.output_dir:
                return
                
        # Save current annotations first
        self.save_annotations()
        
        # Export all images
        success_count = 0
        for i, image_path in enumerate(self.image_files):
            try:
                # Load image
                original_index = self.current_index
                self.current_index = i
                self.load_current_image()
                
                if self.annotations:
                    self.save_annotations()
                    success_count += 1
                    
            except Exception as e:
                print(f"Error processing {image_path}: {str(e)}")
                
        # Restore original image
        self.current_index = original_index
        self.load_current_image()
        
        messagebox.showinfo("Export Complete", f"Successfully exported annotations for {success_count} images.")
        
    def load_settings(self):
        # Load settings from config file if exists
        config_path = Path("labeler_config.json")
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    self.class_names = config.get('class_names', self.class_names)
                    self.annotation_format = config.get('format', self.annotation_format)
                    self.output_dir = config.get('output_dir', self.output_dir)
            except:
                pass
                
    def save_settings(self):
        config = {
            'class_names': self.class_names,
            'format': self.annotation_format,
            'output_dir': self.output_dir
        }
        
        with open("labeler_config.json", 'w') as f:
            json.dump(config, f, indent=2)


class ClassManagerDialog:
    def __init__(self, parent, class_names):
        self.result = None
        self.class_names = class_names.copy()
        
        # Create dialog window
        self.dialog = tk.Toplevel(parent)
        self.dialog.title("Manage Classes")
        self.dialog.geometry("400x500")
        self.dialog.transient(parent)
        self.dialog.grab_set()
        
        # Center the dialog
        self.dialog.update_idletasks()
        x = (self.dialog.winfo_screenwidth() // 2) - (400 // 2)
        y = (self.dialog.winfo_screenheight() // 2) - (500 // 2)
        self.dialog.geometry(f"400x500+{x}+{y}")
        
        self.create_widgets()
        
    def create_widgets(self):
        # Main frame
        main_frame = ttk.Frame(self.dialog, padding=10)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = ttk.Label(main_frame, text="Manage Object Classes", font=('Arial', 14, 'bold'))
        title_label.pack(pady=(0, 10))
        
        # Class list frame
        list_frame = ttk.LabelFrame(main_frame, text="Current Classes", padding=5)
        list_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # Listbox with scrollbar
        listbox_frame = ttk.Frame(list_frame)
        listbox_frame.pack(fill=tk.BOTH, expand=True)
        
        self.class_listbox = tk.Listbox(listbox_frame)
        scrollbar = ttk.Scrollbar(listbox_frame, orient=tk.VERTICAL, command=self.class_listbox.yview)
        self.class_listbox.configure(yscrollcommand=scrollbar.set)
        
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.class_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Update listbox
        self.update_class_list()
        
        # Add class frame
        add_frame = ttk.Frame(main_frame)
        add_frame.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Label(add_frame, text="Add Class:").pack(side=tk.LEFT)
        self.class_entry = ttk.Entry(add_frame, width=20)
        self.class_entry.pack(side=tk.LEFT, padx=(5, 0), fill=tk.X, expand=True)
        self.class_entry.bind('<Return>', self.add_class)
        
        ttk.Button(add_frame, text="Add", command=self.add_class).pack(side=tk.LEFT, padx=(5, 0))
        
        # Buttons frame
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Button(button_frame, text="Remove Selected", command=self.remove_selected).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(button_frame, text="Move Up", command=self.move_up).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(button_frame, text="Move Down", command=self.move_down).pack(side=tk.LEFT, padx=(0, 5))
        
        # Predefined classes frame
        predefined_frame = ttk.LabelFrame(main_frame, text="Quick Add", padding=5)
        predefined_frame.pack(fill=tk.X, pady=(0, 10))
        
        predefined_classes = ["person", "car", "truck", "bus", "motorcycle", "bicycle", "dog", "cat", "bird"]
        
        for i, cls in enumerate(predefined_classes):
            if i % 3 == 0:
                row_frame = ttk.Frame(predefined_frame)
                row_frame.pack(fill=tk.X, pady=2)
            
            ttk.Button(row_frame, text=cls, width=12, 
                      command=lambda c=cls: self.add_predefined_class(c)).pack(side=tk.LEFT, padx=2)
        
        # Dialog buttons
        dialog_button_frame = ttk.Frame(main_frame)
        dialog_button_frame.pack(fill=tk.X)
        
        ttk.Button(dialog_button_frame, text="OK", command=self.ok_clicked).pack(side=tk.RIGHT, padx=(5, 0))
        ttk.Button(dialog_button_frame, text="Cancel", command=self.cancel_clicked).pack(side=tk.RIGHT)
        
        # Focus on entry
        self.class_entry.focus()
        
    def update_class_list(self):
        self.class_listbox.delete(0, tk.END)
        for cls in self.class_names:
            self.class_listbox.insert(tk.END, cls)
            
    def add_class(self, event=None):
        class_name = self.class_entry.get().strip()
        if class_name and class_name not in self.class_names:
            self.class_names.append(class_name)
            self.update_class_list()
            self.class_entry.delete(0, tk.END)
            
    def add_predefined_class(self, class_name):
        if class_name not in self.class_names:
            self.class_names.append(class_name)
            self.update_class_list()
            
    def remove_selected(self):
        selection = self.class_listbox.curselection()
        if selection:
            index = selection[0]
            del self.class_names[index]
            self.update_class_list()
            
    def move_up(self):
        selection = self.class_listbox.curselection()
        if selection and selection[0] > 0:
            index = selection[0]
            self.class_names[index], self.class_names[index-1] = self.class_names[index-1], self.class_names[index]
            self.update_class_list()
            self.class_listbox.selection_set(index-1)
            
    def move_down(self):
        selection = self.class_listbox.curselection()
        if selection and selection[0] < len(self.class_names) - 1:
            index = selection[0]
            self.class_names[index], self.class_names[index+1] = self.class_names[index+1], self.class_names[index]
            self.update_class_list()
            self.class_listbox.selection_set(index+1)
            
    def ok_clicked(self):
        self.result = self.class_names
        self.dialog.destroy()
        
    def cancel_clicked(self):
        self.dialog.destroy()


def main():
    # Create main window
    root = tk.Tk()
    
    # Set application icon (if available)
    try:
        root.iconbitmap("labeler_icon.ico")
    except:
        pass
    
    # Create and run application
    app = ImageLabeler(root)
    
    # Handle window closing
    def on_closing():
        app.save_annotations()   # <--- اینو اضافه کن
        app.save_settings()
        root.destroy()
    
    root.protocol("WM_DELETE_WINDOW", on_closing)
    
    # Keyboard shortcuts
    def on_key_press(event):
        if event.keysym == 'Left':
            app.previous_image()
        elif event.keysym == 'Right':
            app.next_image()
        elif event.keysym == 'Delete':
            app.delete_selected_annotation()
        elif event.keysym == 'Escape':
            app.clear_all_annotations()
        elif event.char == '+':
            app.zoom_in()
        elif event.char == '-':
            app.zoom_out()
        elif event.char == '0':
            app.fit_to_window()
            
    root.bind('<Key>', on_key_press)
    root.focus_set()
    
    # Start the application
    root.mainloop()


if __name__ == "__main__":
    main()


                        
    def load_pascal_voc_annotations(self, image_path):
        xml_path = image_path.with_suffix('.xml')
        if self.output_dir:
            xml_path = Path(self.output_dir) / xml_path.name

        if xml_path.exists():
            try:
                tree = ET.parse(xml_path)
                root = tree.getroot()

                for obj in root.findall('object'):
                    class_name = obj.find('name').text
                    bbox = obj.find('bndbox')

                    x1 = int(bbox.find('xmin').text)
                    y1 = int(bbox.find('ymin').text)
                    x2 = int(bbox.find('xmax').text)
                    y2 = int(bbox.find('ymax').text)

                    self.annotations.append({
                        'class': class_name,
                        'x1': x1,
                        'y1': y1,
                        'x2': x2,
                        'y2': y2
                    })
            except ET.ParseError:
                pass
